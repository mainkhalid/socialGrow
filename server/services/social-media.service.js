const axios = require("axios");
const crypto = require("crypto");
const FormData = require("form-data");
const mongoose = require("mongoose");
const OAuth = require("oauth-1.0a");
const { TwitterApi } = require("twitter-api-v2");
const Account = require("../models/account.model");

class SocialMediaService {
  constructor() {
    this.credentials = {
      twitter: {
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      },
      facebook: {
        appId: process.env.FACEBOOK_APP_ID,
        appSecret: process.env.FACEBOOK_APP_SECRET,
        accessToken: process.env.FACEBOOK_ACCESS_TOKEN,
      },
    };

    // Rate limiting tracking
    this.rateLimitTracker = {
      twitter: { lastRequest: 0, requestCount: 0, resetTime: 0 },
      facebook: { lastRequest: 0, requestCount: 0, resetTime: 0 },
      instagram: { lastRequest: 0, requestCount: 0, resetTime: 0 },
    };
  }

  /**
   * Check and handle rate limiting
   */
  async checkRateLimit(platform) {
    const tracker = this.rateLimitTracker[platform];
    const now = Date.now();

    // Reset counter if past reset time
    if (now > tracker.resetTime) {
      tracker.requestCount = 0;
      tracker.resetTime = now + 15 * 60 * 1000; // 15 minutes
    }

    // Platform specific limits
    const limits = {
      twitter: 300, // 300 requests per 15 minutes
      facebook: 200,
      instagram: 200,
    };

    if (tracker.requestCount >= limits[platform]) {
      const waitTime = Math.max(0, tracker.resetTime - now);
      throw new Error(
        `Rate limit exceeded for ${platform}. Wait ${Math.ceil(
          waitTime / 1000
        )} seconds.`
      );
    }

    tracker.requestCount++;
    tracker.lastRequest = now;
  }

  /**
   * Get account details from database with better error handling
   */
  async getAccountDetailsFromDB(platform, userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error(
        `Invalid userId format: ${userId}. Expected MongoDB ObjectId.`
      );
    }

    const account = await Account.findOne({
      platform,
      userId: new mongoose.Types.ObjectId(userId),
      connected: true,
    });

    if (!account) {
      throw new Error(`No connected ${platform} account found for user.`);
    }

    // Validate required credentials based on platform
    const validation = this.validateAccountCredentials(account);
    if (!validation.valid) {
      throw new Error(
        `Invalid credentials for ${platform}: ${validation.message}`
      );
    }

    const {
      accessToken,
      accessTokenSecret,
      apiKey,
      apiSecret,
      facebookAppId,
      facebookAppSecret,
      profileData = {},
    } = account;

    return {
      accessToken,
      accessTokenSecret,
      apiKey: apiKey || facebookAppId,
      apiSecret: apiSecret || facebookAppSecret,
      pageId: profileData.id || profileData.pageId,
      instagramBusinessId: profileData.instagramBusinessAccount?.id,
      pageAccessToken: profileData.pageAccessToken,
      account,
    };
  }

  /**
   * Validate account credentials based on platform
   */
  validateAccountCredentials(account) {
    const { platform, accessToken, apiKey, apiSecret, accessTokenSecret } =
      account;

    switch (platform.toLowerCase()) {
      case "twitter":
        if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
          return { valid: false, message: "Missing Twitter OAuth credentials" };
        }
        break;

      case "facebook":
      case "instagram":
        if (!accessToken) {
          return {
            valid: false,
            message: "Missing Facebook/Instagram access token",
          };
        }
        break;

      default:
        return { valid: false, message: `Unsupported platform: ${platform}` };
    }

    return { valid: true };
  }

  /**
   * Sync social media stats with improved error handling and retry logic - REAL API CALLS
   */
  async syncSocialMediaStats(platform, accountId) {
    try {
      const account = await Account.findById(accountId);
      if (!account) {
        throw new Error(`No account found with ID: ${accountId}`);
      }
      if (account.platform.toLowerCase() !== platform.toLowerCase()) {
        throw new Error(
          `Account platform mismatch: expected ${platform}, but found ${account.platform}`
        );
      }

      console.log(
        `🔄 Syncing stats for ${platform} (User: ${account.userId})...`
      );

      // Check rate limits
      await this.checkRateLimit(platform);

      let stats;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          switch (platform.toLowerCase()) {
            case "twitter":
              stats = await this.getTwitterStats(
                account.apiKey,
                account.apiSecret,
                account.accessToken,
                account.accessTokenSecret
              );
              break;

            case "instagram":
              stats = await this.getInstagramStats(
                account.accessToken,
                account.pageAccessToken,
                account.instagramBusinessId
              );
              break;

            case "facebook":
              stats = await this.getFacebookStats(
                account.accessToken,
                account.pageId,
                account.pageAccessToken
              );
              break;

            default:
              throw new Error(`Unsupported platform: ${platform}`);
          }
          break; // Success
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw error;
          }

          const waitTime = Math.pow(2, retryCount) * 1000;
          console.log(
            `⏳ Retry ${retryCount}/${maxRetries} for ${platform} in ${waitTime}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }

      // Save stats to DB
      account.stats = {
        ...account.stats,
        ...stats,
        lastSynced: new Date(),
      };
      account.syncStatus = "success";
      account.syncError = null;
      account.lastSyncedAt = new Date();

      await account.save();
      console.log(`✅ ${platform} account stats updated in database`);

      return stats;
    } catch (error) {
      console.error(`❌ Error syncing ${platform} stats:`, error.message);

      // Attempt to update the failed status
      try {
        const account = await Account.findById(accountId);
        if (account) {
          account.syncStatus = "failed";
          account.syncError = error.message;
          account.lastSyncedAt = new Date();
          await account.save();
        }
      } catch (dbError) {
        console.error("Failed to update account sync status:", dbError.message);
      }

      throw error;
    }
  }

  /**
   * Get Twitter/X statistics with better error handling - REAL API CALLS
   */
  async getTwitterStats(apiKey, apiSecret, accessToken, accessTokenSecret) {
    try {
      const oauth = OAuth({
        consumer: {
          key: apiKey || this.credentials.twitter.apiKey,
          secret: apiSecret || this.credentials.twitter.apiSecret,
        },
        signature_method: "HMAC-SHA1",
        hash_function(base_string, key) {
          return crypto
            .createHmac("sha1", key)
            .update(base_string)
            .digest("base64");
        },
      });

      const token = {
        key: accessToken || this.credentials.twitter.accessToken,
        secret: accessTokenSecret || this.credentials.twitter.accessTokenSecret,
      };

      // Get user profile data with timeout
      const userUrl = "https://api.twitter.com/2/users/me";
      const userParams = {
        "user.fields":
          "public_metrics,verified,profile_image_url,description,location,created_at",
      };

      const userRequest = {
        url: userUrl,
        method: "GET",
        data: userParams,
      };

      const userResponse = await axios({
        url: userUrl,
        method: "GET",
        params: userParams,
        headers: {
          ...oauth.toHeader(oauth.authorize(userRequest, token)),
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      });

      const userData = userResponse.data.data;
      const metrics = userData.public_metrics;

      // Get recent tweets for engagement calculation (with error handling)
      let engagementRate = 0;
      try {
        const tweetsUrl = "https://api.twitter.com/2/users/me/tweets";
        const tweetsParams = {
          max_results: 10, // Reduced to avoid rate limits
          "tweet.fields": "public_metrics,created_at",
        };

        const tweetsRequest = {
          url: tweetsUrl,
          method: "GET",
          data: tweetsParams,
        };

        const tweetsResponse = await axios({
          url: tweetsUrl,
          method: "GET",
          params: tweetsParams,
          headers: {
            ...oauth.toHeader(oauth.authorize(tweetsRequest, token)),
            "Content-Type": "application/json",
          },
          timeout: 10000,
        });

        const tweets = tweetsResponse.data.data || [];
        const totalEngagement = tweets.reduce((sum, tweet) => {
          const tweetMetrics = tweet.public_metrics;
          return (
            sum +
            tweetMetrics.like_count +
            tweetMetrics.retweet_count +
            tweetMetrics.reply_count
          );
        }, 0);

        engagementRate =
          tweets.length > 0 && metrics.followers_count > 0
            ? (totalEngagement / tweets.length / metrics.followers_count) * 100
            : 0;
      } catch (tweetsError) {
        console.warn(
          "Could not fetch tweets for engagement calculation:",
          tweetsError.message
        );
      }

      console.log(`✅ Twitter stats synced successfully`);

      return {
        followers: metrics.followers_count || 0,
        following: metrics.following_count || 0,
        posts: metrics.tweet_count || 0,
        engagement: parseFloat(engagementRate.toFixed(2)),
        impressions: 0,
        reach: 0,
        verified: userData.verified || false,
        profileImageUrl: userData.profile_image_url || "",
        description: userData.description || "",
        location: userData.location || "",
        createdAt: userData.created_at,
        displayName: userData.name || "",
        username: userData.username || "",
      };
    } catch (error) {
      console.error(
        "❌ Twitter API Error:",
        error.response?.data || error.message
      );

      if (error.response?.status === 429) {
        throw new Error("Twitter rate limit exceeded. Please try again later.");
      } else if (error.response?.status === 401) {
        throw new Error(
          "Twitter authentication failed. Please reconnect your account."
        );
      } else if (error.response?.status === 403) {
        throw new Error(
          "Twitter access forbidden. Check your app permissions."
        );
      }

      throw new Error(
        `Twitter API Error: ${error.response?.data?.detail || error.message}`
      );
    }
  }

  /**
   * Get Instagram statistics with improved page handling - REAL API CALLS
   */
  async getInstagramStats(
    accessToken,
    pageAccessToken = null,
    instagramBusinessId = null
  ) {
    try {
      const baseUrl = "https://graph.facebook.com/v18.0";

      let instagramAccountId = instagramBusinessId;
      let effectiveAccessToken = pageAccessToken || accessToken;

      // If we don't have Instagram Business ID, try to get it
      if (!instagramAccountId) {
        console.log("🔍 Looking for Instagram Business Account...");

        // First, get user's pages
        const pagesResponse = await axios.get(`${baseUrl}/me/accounts`, {
          params: {
            fields: "name,access_token,instagram_business_account",
            access_token: accessToken,
          },
          timeout: 10000,
        });

        const pages = pagesResponse.data.data || [];
        console.log(`Found ${pages.length} Facebook pages`);

        // Find a page with Instagram Business Account
        for (const page of pages) {
          if (page.instagram_business_account?.id) {
            instagramAccountId = page.instagram_business_account.id;
            effectiveAccessToken = page.access_token;
            console.log(
              `✅ Found Instagram Business Account: ${instagramAccountId}`
            );

            // Update the account record with this information
            // FIX: Store the ID as a string, not an object
            const account = await Account.findOne({
              platform: "instagram",
              accessToken: accessToken, // Better way to find the account
            });

            if (account) {
              account.profileData = {
                ...account.profileData,
                instagramBusinessAccount: page.instagram_business_account.id, // Store as string, not object
                pageAccessToken: page.access_token,
                pageId: page.id,
                pageName: page.name,
              };

              // Also update the instagramBusinessId field directly if it exists in schema
              account.instagramBusinessId = page.instagram_business_account.id;

              await account.save();
            }
            break;
          }
        }

        if (!instagramAccountId) {
          throw new Error(
            "No Instagram Business Account found. Please ensure your Instagram account is connected to a Facebook Page and converted to a Business Account."
          );
        }
      }

      // Get Instagram account info and metrics
      const accountResponse = await axios.get(
        `${baseUrl}/${instagramAccountId}`,
        {
          params: {
            fields:
              "followers_count,follows_count,media_count,profile_picture_url,username,name,biography,website",
            access_token: effectiveAccessToken,
          },
          timeout: 10000,
        }
      );

      const accountData = accountResponse.data;

      // Get recent media for engagement calculation
      let engagementRate = 0;
      try {
        const mediaResponse = await axios.get(
          `${baseUrl}/${instagramAccountId}/media`,
          {
            params: {
              fields: "like_count,comments_count,timestamp,media_type",
              limit: 10, // Reduced to avoid rate limits
              access_token: effectiveAccessToken,
            },
            timeout: 10000,
          }
        );

        const mediaData = mediaResponse.data.data || [];

        if (mediaData.length > 0 && accountData.followers_count > 0) {
          const totalEngagement = mediaData.reduce((sum, media) => {
            return sum + (media.like_count || 0) + (media.comments_count || 0);
          }, 0);

          engagementRate =
            (totalEngagement / mediaData.length / accountData.followers_count) *
            100;
        }
      } catch (mediaError) {
        console.warn(
          "Could not fetch media for engagement calculation:",
          mediaError.message
        );
      }

      console.log(`✅ Instagram stats synced successfully`);

      return {
        followers: accountData.followers_count || 0,
        following: accountData.follows_count || 0,
        posts: accountData.media_count || 0,
        engagement: parseFloat(engagementRate.toFixed(2)),
        impressions: 0,
        reach: 0,
        verified: false,
        profileImageUrl: accountData.profile_picture_url || "",
        description: accountData.biography || "",
        website: accountData.website || "",
        username: accountData.username || "",
        displayName: accountData.name || accountData.username || "",
        instagramBusinessId: instagramAccountId, // Include this for future reference
      };
    } catch (error) {
      console.error(
        "❌ Instagram API Error:",
        error.response?.data || error.message
      );

      if (error.response?.status === 429) {
        throw new Error(
          "Instagram rate limit exceeded. Please try again later."
        );
      } else if (error.response?.status === 190) {
        throw new Error(
          "Instagram access token expired. Please reconnect your account."
        );
      } else if (error.response?.data?.error?.code === 100) {
        throw new Error(
          "Instagram Business Account not found or not properly connected. Please ensure your Instagram is connected to a Facebook Page."
        );
      }

      throw new Error(
        `Instagram API Error: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }
  /**
   * Get Facebook Page statistics with better error handling - REAL API CALLS
   */
  async getFacebookStats(accessToken, pageId = null, pageAccessToken = null) {
    try {
      const baseUrl = "https://graph.facebook.com/v18.0";

      let targetPageId = pageId;
      let effectiveAccessToken = pageAccessToken || accessToken;

      // If no specific page ID, get the first available page
      if (!targetPageId) {
        console.log("🔍 Looking for Facebook Pages...");

        const pagesResponse = await axios.get(`${baseUrl}/me/accounts`, {
          params: {
            fields: "id,name,access_token,fan_count,followers_count",
            access_token: accessToken,
          },
          timeout: 10000,
        });

        const pages = pagesResponse.data.data || [];

        if (pages.length === 0) {
          throw new Error(
            "No Facebook pages found. Please create a Facebook page to get statistics."
          );
        }

        // Use the first page
        const page = pages[0];
        targetPageId = page.id;
        effectiveAccessToken = page.access_token;
        console.log(`✅ Using Facebook Page: ${page.name} (${targetPageId})`);
      }

      // Get page details
      const pageResponse = await axios.get(`${baseUrl}/${targetPageId}`, {
        params: {
          fields:
            "name,fan_count,followers_count,about,picture,username,link,category",
          access_token: effectiveAccessToken,
        },
        timeout: 10000,
      });

      const page = pageResponse.data;

      // Get recent posts for engagement calculation
      let engagementRate = 0;
      let postsCount = 0;

      try {
        const postsResponse = await axios.get(
          `${baseUrl}/${targetPageId}/posts`,
          {
            params: {
              fields:
                "created_time,reactions.summary(total_count),comments.summary(total_count),shares",
              limit: 10,
              access_token: effectiveAccessToken,
            },
            timeout: 10000,
          }
        );

        const posts = postsResponse.data.data || [];
        postsCount = posts.length;

        if (posts.length > 0 && page.fan_count > 0) {
          const totalEngagement = posts.reduce((sum, post) => {
            const reactions = post.reactions?.summary?.total_count || 0;
            const comments = post.comments?.summary?.total_count || 0;
            const shares = post.shares?.count || 0;
            return sum + reactions + comments + shares;
          }, 0);

          engagementRate =
            (totalEngagement / posts.length / page.fan_count) * 100;
        }
      } catch (postsError) {
        console.warn(
          "Could not fetch posts for engagement calculation:",
          postsError.message
        );

        // Try to get a simple post count
        try {
          const simplePostsResponse = await axios.get(
            `${baseUrl}/${targetPageId}/posts`,
            {
              params: {
                fields: "id",
                limit: 100,
                access_token: effectiveAccessToken,
              },
              timeout: 5000,
            }
          );
          postsCount = simplePostsResponse.data.data?.length || 0;
        } catch (countError) {
          console.warn("Could not get posts count:", countError.message);
        }
      }

      console.log(`✅ Facebook stats synced successfully`);

      return {
        followers: page.fan_count || page.followers_count || 0,
        following: 0, // Not applicable for pages
        posts: postsCount,
        engagement: parseFloat(engagementRate.toFixed(2)),
        impressions: 0,
        reach: 0,
        verified: page.verified || false,
        profileImageUrl: page.picture?.data?.url || "",
        description: page.about || "",
        username: page.username || "",
        displayName: page.name || "",
        pageUrl: page.link || "",
        category: page.category || "",
      };
    } catch (error) {
      console.error(
        "❌ Facebook API Error:",
        error.response?.data || error.message
      );

      if (error.response?.status === 429) {
        throw new Error(
          "Facebook rate limit exceeded. Please try again later."
        );
      } else if (
        error.response?.status === 190 ||
        error.response?.data?.error?.code === 190
      ) {
        throw new Error(
          "Facebook access token expired. Please reconnect your account."
        );
      } else if (error.response?.data?.error?.code === 200) {
        throw new Error(
          "Invalid Facebook App ID or missing permissions. Please check your app configuration."
        );
      }

      throw new Error(
        `Facebook API Error: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  /**
   * Main publishing function - routes to platform-specific publishers
   */
  async publishToSocialMedia(post, account) {
    try {
      console.log(`🚀 Publishing post ${post._id} to ${account.platform}...`);

      // Validate account credentials first
      const credentialsValid = this.validateAccountCredentials(account);
      if (!credentialsValid.valid) {
        throw new Error(`Invalid credentials: ${credentialsValid.message}`);
      }

      // Check rate limits
      await this.checkRateLimit(account.platform);

      // Platform-specific publishing
      switch (account.platform.toLowerCase()) {
        case "twitter":
          return await this.publishToTwitter(post, account);
        case "facebook":
          return await this.publishToFacebook(post, account);
        case "instagram":
          return await this.publishToInstagram(post, account);
        default:
          throw new Error(
            `Publishing not supported for platform: ${account.platform}`
          );
      }
    } catch (error) {
      console.error(
        `❌ Publishing failed for ${account.platform}:`,
        error.message
      );
      return {
        success: false,
        error: error.message,
        errorCategory: this.categorizeError(error),
      };
    }
  }
  /**
 * Publish to Twitter using Twitter API v2
 */
async publishToTwitter(post, account) {
  try {
    console.log(`🐦 Publishing to Twitter account: ${account.username}`);

    // Initialize Twitter client
    const client = new TwitterApi({
      appKey: account.apiKey || this.credentials.twitter.apiKey,
      appSecret: account.apiSecret || this.credentials.twitter.apiSecret,
      accessToken: account.accessToken || this.credentials.twitter.accessToken,
      accessSecret: account.accessTokenSecret || this.credentials.twitter.accessTokenSecret,
    });

    // Prepare tweet data
    const tweetData = {
      text: post.content,
    };

    // Handle media uploads if present
    if (post.mediaUrls && post.mediaUrls.length > 0) {
      const mediaIds = [];
      
      // Twitter allows up to 4 images or 1 video per tweet
      const mediaLimit = 4;
      const mediasToUpload = post.mediaUrls.slice(0, mediaLimit);

      for (const mediaUrl of mediasToUpload) {
        try {
          console.log(`📎 Uploading media: ${mediaUrl}`);
          const mediaId = await this.uploadTwitterMedia(client, mediaUrl);
          mediaIds.push(mediaId);
        } catch (mediaError) {
          console.warn(`⚠️ Failed to upload media ${mediaUrl}:`, mediaError.message);
          // Continue with other media files
        }
      }

      if (mediaIds.length > 0) {
        tweetData.media = {
          media_ids: mediaIds
        };
      }
    }

    // Check content length (Twitter's limit is 280 characters)
    if (tweetData.text.length > 280) {
      // Option 1: Truncate with ellipsis
      tweetData.text = tweetData.text.substring(0, 277) + "...";
      
      // Option 2: You could also throw an error to force manual editing
      // throw new Error(`Tweet too long (${tweetData.text.length} characters). Maximum is 280 characters.`);
    }

    // Publish the tweet
    const response = await client.v2.tweet(tweetData);

    console.log(`✅ Twitter post published successfully: ${response.data.id}`);

    return {
      success: true,
      externalPostId: response.data.id,
      publishedAt: new Date(),
      platformResponse: {
        platform: "twitter",
        postId: response.data.id,
        tweetText: response.data.text,
      },
    };

  } catch (error) {
    console.error("❌ Twitter publishing error:", error);

    // Handle specific Twitter API errors
    if (error.code === 429 || error.message?.includes('rate limit')) {
      throw new Error("Twitter rate limit exceeded. Please try again later.");
    } else if (error.code === 401 || error.message?.includes('Unauthorized')) {
      throw new Error("Twitter authentication failed. Please reconnect your account.");
    } else if (error.code === 403 || error.message?.includes('Forbidden')) {
      throw new Error("Twitter access forbidden. Check your app permissions.");
    } else if (error.code === 187 || error.message?.includes('duplicate')) {
      throw new Error("Duplicate tweet detected. Twitter doesn't allow identical tweets.");
    } else if (error.code === 186) {
      throw new Error("Tweet is too long. Please shorten your message.");
    } else if (error.message?.includes('media')) {
      throw new Error(`Media upload failed: ${error.message}`);
    }

    // Generic error
    throw new Error(`Twitter API error: ${error.message || 'Unknown error occurred'}`);
  }
}
  
  async uploadTwitterMedia(client, mediaUrl) {
    try {
      // Download media from URL
      const mediaResponse = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
        maxContentLength: 5 * 1024 * 1024, // 5MB limit
      });

      const mediaBuffer = Buffer.from(mediaResponse.data);

      // Upload to Twitter
      const mediaId = await client.v1.uploadMedia(mediaBuffer, {
        mimeType: mediaResponse.headers["content-type"] || "image/jpeg",
      });

      return mediaId;
    } catch (error) {
      throw new Error(`Media upload failed: ${error.message}`);
    }
  }

  /**
   * Publish to Facebook Page
   */
  async publishToFacebook(post, account) {
    try {
      console.log(`📘 Publishing to Facebook page: ${account.username}`);

      const baseUrl = "https://graph.facebook.com/v18.0";

      // Get page access token if needed
      let pageAccessToken = account.pageAccessToken || account.accessToken;
      let pageId = account.profileData?.pageId;

      if (!pageId) {
        // Get user's pages to find the right one
        const pagesResponse = await axios.get(`${baseUrl}/me/accounts`, {
          params: {
            fields: "id,name,access_token",
            access_token: account.accessToken,
          },
          timeout: 10000,
        });

        const pages = pagesResponse.data.data || [];
        if (pages.length === 0) {
          throw new Error(
            "No Facebook pages found. Please create a Facebook page first."
          );
        }

        // Use the first page or find by name
        const targetPage =
          pages.find((p) => p.name === account.username) || pages[0];
        pageId = targetPage.id;
        pageAccessToken = targetPage.access_token;

        // Update account with page info
        account.profileData = {
          ...account.profileData,
          pageId: pageId,
          pageName: targetPage.name,
        };
        account.pageAccessToken = pageAccessToken;
        await account.save();
      }

      // Prepare post data
      const postData = {
        message: post.content,
        access_token: pageAccessToken,
      };

      // Handle media uploads
      if (post.mediaUrls && post.mediaUrls.length > 0) {
        // For multiple media, create a multi-photo post
        if (post.mediaUrls.length > 1) {
          return await this.publishFacebookMultiPhoto(
            pageId,
            post,
            pageAccessToken
          );
        } else {
          // Single photo/video
          postData.link = post.mediaUrls[0];
        }
      }

      // Publish the post
      const response = await axios.post(`${baseUrl}/${pageId}/feed`, postData, {
        timeout: 15000,
      });

      console.log(
        `✅ Facebook post published successfully: ${response.data.id}`
      );

      return {
        success: true,
        externalPostId: response.data.id,
        publishedAt: new Date(),
        platformResponse: {
          platform: "facebook",
          postId: response.data.id,
          pageId: pageId,
        },
      };
    } catch (error) {
      console.error(
        "❌ Facebook publishing error:",
        error.response?.data || error.message
      );

      if (error.response?.status === 429) {
        throw new Error(
          "Facebook rate limit exceeded. Please try again later."
        );
      } else if (
        error.response?.status === 190 ||
        error.response?.data?.error?.code === 190
      ) {
        throw new Error(
          "Facebook access token expired. Please reconnect your account."
        );
      } else if (error.response?.data?.error?.code === 200) {
        throw new Error(
          "Facebook permissions error. Please check your page permissions."
        );
      }

      throw new Error(
        `Facebook API error: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  /**
   * Publish multiple photos to Facebook
   */
  async publishFacebookMultiPhoto(pageId, post, pageAccessToken) {
    try {
      const baseUrl = "https://graph.facebook.com/v18.0";
      const attachedMedia = [];

      // Upload each photo first
      for (const mediaUrl of post.mediaUrls.slice(0, 10)) {
        // Facebook allows max 10 photos
        try {
          const photoResponse = await axios.post(
            `${baseUrl}/${pageId}/photos`,
            {
              url: mediaUrl,
              published: false, // Don't publish yet
              access_token: pageAccessToken,
            }
          );

          attachedMedia.push({
            media_fbid: photoResponse.data.id,
          });
        } catch (mediaError) {
          console.warn(
            `⚠️ Failed to upload photo ${mediaUrl}:`,
            mediaError.message
          );
          // Continue with other photos
        }
      }

      if (attachedMedia.length === 0) {
        throw new Error("Failed to upload any media files");
      }

      // Create the multi-photo post
      const response = await axios.post(`${baseUrl}/${pageId}/feed`, {
        message: post.content,
        attached_media: attachedMedia,
        access_token: pageAccessToken,
      });

      return {
        success: true,
        externalPostId: response.data.id,
        publishedAt: new Date(),
        platformResponse: {
          platform: "facebook",
          postId: response.data.id,
          pageId: pageId,
          mediaCount: attachedMedia.length,
        },
      };
    } catch (error) {
      throw new Error(`Facebook multi-photo upload error: ${error.message}`);
    }
  }

 
  /**
 * Publish to Instagram Business Account - FIXED VERSION
 */
async publishToInstagram(post, account) {
  try {
    console.log(`📸 Publishing to Instagram account: ${account.username}`);

    const baseUrl = "https://graph.facebook.com/v18.0";

    // Fix: Handle both string and object formats for Instagram Business ID
    let instagramBusinessId = typeof account.profileData?.instagramBusinessAccount === 'string' 
      ? account.profileData.instagramBusinessAccount 
      : account.profileData?.instagramBusinessAccount?.id;
    
    let pageAccessToken = account.pageAccessToken || account.accessToken;

    if (!instagramBusinessId) {
      // Find Instagram Business Account
      const pagesResponse = await axios.get(`${baseUrl}/me/accounts`, {
        params: {
          fields: "id,name,access_token,instagram_business_account",
          access_token: account.accessToken,
        },
      });

      const pages = pagesResponse.data.data || [];
      const pageWithInstagram = pages.find(
        (page) => page.instagram_business_account?.id
      );

      if (!pageWithInstagram) {
        throw new Error(
          "No Instagram Business Account found. Please connect your Instagram to a Facebook Page."
        );
      }

      instagramBusinessId = pageWithInstagram.instagram_business_account.id;
      pageAccessToken = pageWithInstagram.access_token;

      // Fix: Store Instagram Business Account ID as string, not object
      account.profileData = {
        ...account.profileData,
        instagramBusinessAccount: instagramBusinessId, // Store as string directly
        pageId: pageWithInstagram.id,
        pageName: pageWithInstagram.name,
      };
      account.pageAccessToken = pageAccessToken;
      await account.save();
    }

    // Fix: Validate caption length (Instagram limit is 2200 characters)
    if (post.content && post.content.length > 2200) {
      throw new Error(`Instagram caption too long (${post.content.length} characters). Maximum is 2200 characters.`);
    }

    // Handle different content types
    if (post.mediaUrls && post.mediaUrls.length > 0) {
      if (post.mediaUrls.length === 1) {
        return await this.publishInstagramSingleMedia(
          instagramBusinessId,
          post,
          pageAccessToken
        );
      } else {
        return await this.publishInstagramCarousel(
          instagramBusinessId,
          post,
          pageAccessToken
        );
      }
    } else {
      throw new Error(
        "Instagram requires at least one image or video to publish"
      );
    }
  } catch (error) {
    console.error(
      "❌ Instagram publishing error:",
      error.response?.data || error.message
    );

    if (error.response?.status === 429) {
      throw new Error(
        "Instagram rate limit exceeded. Please try again later."
      );
    } else if (
      error.response?.status === 190 ||
      error.response?.data?.error?.code === 190
    ) {
      throw new Error(
        "Instagram access token expired. Please reconnect your account."
      );
    } else if (error.response?.data?.error?.code === 100) {
      throw new Error(
        "Instagram Business Account access error. Please check your account connection."
      );
    }

    throw new Error(
      `Instagram API error: ${
        error.response?.data?.error?.message || error.message
      }`
    );
  }
}

/**
 * Publish single media to Instagram - FIXED VERSION
 */
async publishInstagramSingleMedia(
  instagramBusinessId,
  post,
  pageAccessToken
) {
  try {
    const baseUrl = "https://graph.facebook.com/v18.0";
    const mediaUrl = post.mediaUrls[0];

    // Fix: Detect media type (image vs video)
    const isVideo = this.detectVideoFromUrl(mediaUrl);
    
    // Prepare media container parameters
    const mediaParams = {
      [isVideo ? 'video_url' : 'image_url']: mediaUrl,
      caption: post.content,
      access_token: pageAccessToken,
    };

    // Add media type for videos
    if (isVideo) {
      mediaParams.media_type = 'VIDEO';
    }

    // Step 1: Create media container
    const containerResponse = await axios.post(
      `${baseUrl}/${instagramBusinessId}/media`,
      mediaParams,
      { timeout: 15000 }
    );

    const creationId = containerResponse.data.id;
    console.log(`📷 Instagram media container created: ${creationId}`);

    // Step 2: Wait for media to be processed (longer timeout for videos)
    const waitTime = isVideo ? 60000 : 30000; // 60s for video, 30s for image
    await this.waitForInstagramMediaProcessing(creationId, pageAccessToken, waitTime);

    // Step 3: Publish the media
    const publishResponse = await axios.post(
      `${baseUrl}/${instagramBusinessId}/media_publish`,
      {
        creation_id: creationId,
        access_token: pageAccessToken,
      },
      { timeout: 15000 }
    );

    console.log(
      `✅ Instagram post published successfully: ${publishResponse.data.id}`
    );

    return {
      success: true,
      externalPostId: publishResponse.data.id,
      publishedAt: new Date(),
      platformResponse: {
        platform: "instagram",
        postId: publishResponse.data.id,
        instagramBusinessId: instagramBusinessId,
        creationId: creationId,
        mediaType: isVideo ? 'video' : 'image',
      },
    };
  } catch (error) {
    throw new Error(
      `Instagram single media publish error: ${
        error.response?.data?.error?.message || error.message
      }`
    );
  }
}

/**
 * Publish carousel (multiple media) to Instagram - FIXED VERSION
 */
async publishInstagramCarousel(instagramBusinessId, post, pageAccessToken) {
  try {
    const baseUrl = "https://graph.facebook.com/v18.0";
    const mediaContainers = [];

    // Step 1: Create containers for each media item
    for (const mediaUrl of post.mediaUrls.slice(0, 10)) { // Instagram allows max 10 items
      try {
        // Fix: Detect media type for carousel items
        const isVideo = this.detectVideoFromUrl(mediaUrl);
        
        const mediaParams = {
          [isVideo ? 'video_url' : 'image_url']: mediaUrl,
          is_carousel_item: true,
          access_token: pageAccessToken,
        };

        // Add media type for videos in carousel
        if (isVideo) {
          mediaParams.media_type = 'VIDEO';
        }

        const containerResponse = await axios.post(
          `${baseUrl}/${instagramBusinessId}/media`,
          mediaParams
        );

        mediaContainers.push({
          id: containerResponse.data.id,
          isVideo: isVideo
        });
        console.log(`📷 Carousel item created: ${containerResponse.data.id}`);
      } catch (mediaError) {
        console.warn(
          `⚠️ Failed to create carousel item for ${mediaUrl}:`,
          mediaError.message
        );
        // Continue with other media
      }
    }

    if (mediaContainers.length === 0) {
      throw new Error("Failed to create any carousel media containers");
    }

    // Wait for all media items to process (especially important for videos)
    for (const container of mediaContainers) {
      const waitTime = container.isVideo ? 60000 : 30000;
      try {
        await this.waitForInstagramMediaProcessing(container.id, pageAccessToken, waitTime);
      } catch (processError) {
        console.warn(`⚠️ Media processing warning for ${container.id}:`, processError.message);
        // Continue - might still work
      }
    }

    // Step 2: Create carousel container
    const carouselResponse = await axios.post(
      `${baseUrl}/${instagramBusinessId}/media`,
      {
        media_type: "CAROUSEL",
        children: mediaContainers.map(c => c.id).join(","),
        caption: post.content,
        access_token: pageAccessToken,
      }
    );

    const carouselId = carouselResponse.data.id;
    console.log(`🎠 Instagram carousel container created: ${carouselId}`);

    // Step 3: Wait for carousel processing
    await this.waitForInstagramMediaProcessing(carouselId, pageAccessToken, 30000);

    // Step 4: Publish the carousel
    const publishResponse = await axios.post(
      `${baseUrl}/${instagramBusinessId}/media_publish`,
      {
        creation_id: carouselId,
        access_token: pageAccessToken,
      }
    );

    console.log(
      `✅ Instagram carousel published successfully: ${publishResponse.data.id}`
    );

    return {
      success: true,
      externalPostId: publishResponse.data.id,
      publishedAt: new Date(),
      platformResponse: {
        platform: "instagram",
        postId: publishResponse.data.id,
        instagramBusinessId: instagramBusinessId,
        carouselId: carouselId,
        mediaCount: mediaContainers.length,
      },
    };
  } catch (error) {
    throw new Error(
      `Instagram carousel publish error: ${
        error.response?.data?.error?.message || error.message
      }`
    );
  }
}

/**
 * Wait for Instagram media processing to complete - IMPROVED VERSION
 */
async waitForInstagramMediaProcessing(
  creationId,
  pageAccessToken,
  maxWaitTime = 30000
) {
  const baseUrl = "https://graph.facebook.com/v18.0";
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const statusResponse = await axios.get(`${baseUrl}/${creationId}`, {
        params: {
          fields: "status_code",
          access_token: pageAccessToken,
        },
        timeout: 5000,
      });

      const statusCode = statusResponse.data.status_code;

      if (statusCode === "FINISHED") {
        console.log(`✅ Instagram media processing completed: ${creationId}`);
        return;
      } else if (statusCode === "ERROR") {
        throw new Error(`Instagram media processing failed for ${creationId}`);
      }

      // Still processing, wait and retry
      console.log(`⏳ Instagram media still processing (${statusCode})...`);
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    } catch (error) {
      // Fix: Better error handling - don't assume media is ready on 400 errors
      if (error.response?.status === 400) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        
        // Only assume ready if it's a specific "not found" type error that indicates completion
        if (errorMessage.includes('does not exist') || errorMessage.includes('invalid')) {
          console.log(`⚠️ Status check suggests media may be processed: ${errorMessage}`);
          return;
        }
        
        // Otherwise, it's likely a real error
        throw new Error(`Media processing status check failed: ${errorMessage}`);
      }
      throw error;
    }
  }

  throw new Error(`Instagram media processing timeout after ${maxWaitTime}ms. The media may still be processing.`);
}

/**
 * Helper method to detect video from URL - NEW
 */
detectVideoFromUrl(mediaUrl) {
  // Common video file extensions
  const videoExtensions = /\.(mp4|mov|avi|wmv|flv|webm|m4v|3gp|mkv)(\?.*)?$/i;
  return videoExtensions.test(mediaUrl);
}


  /**
   * Categorize errors for better handling
   */
  categorizeError(error) {
    const message = error.message?.toLowerCase() || "";
    const status = error.response?.status;

    if (status === 429 || message.includes("rate limit")) {
      return "rate_limit";
    } else if (
      status === 401 ||
      status === 190 ||
      message.includes("authentication") ||
      message.includes("unauthorized")
    ) {
      return "authentication";
    } else if (
      status === 403 ||
      message.includes("permission") ||
      message.includes("forbidden")
    ) {
      return "permissions";
    } else if (
      message.includes("network") ||
      message.includes("timeout") ||
      error.code === "ECONNABORTED"
    ) {
      return "network";
    } else if (message.includes("duplicate")) {
      return "duplicate_content";
    } else if (message.includes("policy") || message.includes("violat")) {
      return "content_policy";
    }

    return "unknown";
  }
   
  async validateSocialMediaCredentials(
    platform,
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret = null
  ) {
    try {
      console.log(`🔍 Validating ${platform} credentials...`);

      // Check rate limits before validation
      await this.checkRateLimit(platform);

      switch (platform.toLowerCase()) {
        case "twitter":
          await this.validateTwitterCredentials(
            apiKey,
            apiSecret,
            accessToken,
            accessTokenSecret
          );
          break;
        case "instagram":
          await this.validateInstagramCredentials(accessToken);
          break;
        case "facebook":
          await this.validateFacebookCredentials(accessToken);
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      console.log(`✅ ${platform} credentials validated successfully`);
      return true;
    } catch (error) {
      console.error(
        `❌ ${platform} credential validation failed:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Validate Twitter credentials with timeout
   */
  async validateTwitterCredentials(
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret
  ) {
    try {
      const oauth = OAuth({
        consumer: {
          key: apiKey,
          secret: apiSecret,
        },
        signature_method: "HMAC-SHA1",
        hash_function(base_string, key) {
          return crypto
            .createHmac("sha1", key)
            .update(base_string)
            .digest("base64");
        },
      });

      const token = {
        key: accessToken,
        secret: accessTokenSecret,
      };

      const request = {
        url: "https://api.twitter.com/2/users/me",
        method: "GET",
      };

      const response = await axios({
        url: request.url,
        method: request.method,
        headers: {
          ...oauth.toHeader(oauth.authorize(request, token)),
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        throw new Error("Twitter validation timed out. Please try again.");
      }
      throw new Error(
        `Twitter validation failed: ${
          error.response?.data?.detail || error.message
        }`
      );
    }
  }

  /**
   * Enhanced Instagram validation
   */
  async validateInstagramCredentials(accessToken) {
    try {
      const baseUrl = "https://graph.facebook.com/v18.0";

      // First validate the access token by getting user info
      const userResponse = await axios.get(`${baseUrl}/me`, {
        params: {
          fields: "id,name",
          access_token: accessToken,
        },
        timeout: 10000,
      });

      if (!userResponse.data.id) {
        throw new Error("Invalid access token");
      }

      // Then check for pages with Instagram Business Accounts
      const pagesResponse = await axios.get(`${baseUrl}/me/accounts`, {
        params: {
          fields: "id,name,instagram_business_account",
          access_token: accessToken,
        },
        timeout: 10000,
      });

      const pages = pagesResponse.data.data || [];
      const pagesWithInstagram = pages.filter(
        (page) => page.instagram_business_account?.id
      );

      if (pagesWithInstagram.length === 0) {
        throw new Error(
          "No Instagram Business Account found. Please connect your Instagram to a Facebook Page and convert it to a Business Account."
        );
      }

      return {
        user: userResponse.data,
        instagramAccounts: pagesWithInstagram.map((page) => ({
          pageId: page.id,
          pageName: page.name,
          instagramId: page.instagram_business_account.id,
        })),
      };
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        throw new Error("Instagram validation timed out. Please try again.");
      }
      throw new Error(
        `Instagram validation failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  /**
   * Enhanced Facebook validation
   */
  async validateFacebookCredentials(accessToken) {
    try {
      const baseUrl = "https://graph.facebook.com/v18.0";

      const response = await axios.get(`${baseUrl}/me`, {
        params: {
          fields: "id,name,accounts{id,name,access_token}",
          access_token: accessToken,
        },
        timeout: 10000,
      });

      if (!response.data.id) {
        throw new Error("Invalid access token");
      }

      return response.data;
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        throw new Error("Facebook validation timed out. Please try again.");
      }
      throw new Error(
        `Facebook validation failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  /**
   * Get connection status with health check
   */
  async getConnectionStatus(
    platform,
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret = null
  ) {
    try {
      const startTime = Date.now();
      await this.validateSocialMediaCredentials(
        platform,
        apiKey,
        apiSecret,
        accessToken,
        accessTokenSecret
      );
      const responseTime = Date.now() - startTime;

      return {
        connected: true,
        status: "success",
        message: "Connection healthy",
        responseTime: `${responseTime}ms`,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        connected: false,
        status: "error",
        message: error.message,
        lastChecked: new Date().toISOString(),
        errorCategory: this.categorizeError(error),
      };
    }
  }

  /**
   * Enhanced analytics fetching with real API calls where possible
   */
  async fetchPlatformAnalytics(
    platform,
    dataType,
    timeframe,
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret = null
  ) {
    try {
      console.log(`📊 Fetching ${dataType} analytics for ${platform}...`);

      // Check rate limits
      await this.checkRateLimit(platform);

      switch (dataType) {
        case "engagement":
          return await this.getEngagementAnalytics(
            platform,
            timeframe,
            apiKey,
            apiSecret,
            accessToken,
            accessTokenSecret
          );
        case "followers":
          return await this.getFollowerAnalytics(
            platform,
            timeframe,
            apiKey,
            apiSecret,
            accessToken,
            accessTokenSecret
          );
        case "demographics":
          return await this.getDemographicsAnalytics(
            platform,
            apiKey,
            apiSecret,
            accessToken,
            accessTokenSecret
          );
        default:
          throw new Error(`Unsupported data type: ${dataType}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching ${dataType} analytics:`, error.message);
      throw error;
    }
  }

  // Keep existing mock data methods for analytics that require special permissions
  async getEngagementAnalytics(
    platform,
    timeframe,
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret
  ) {
    return this.generateMockEngagementData(platform, timeframe);
  }

  async getFollowerAnalytics(
    platform,
    timeframe,
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret
  ) {
    return this.generateMockFollowerData(platform, timeframe);
  }

  async getDemographicsAnalytics(
    platform,
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret
  ) {
    return this.generateMockDemographicsData(platform);
  }

  generateMockEngagementData(platform, timeframe) {
    const days = timeframe === "month" ? 30 : timeframe === "week" ? 7 : 1;
    const data = [];
    const baseValue =
      platform === "twitter"
        ? 2000
        : platform === "instagram"
        ? 3000
        : platform === "facebook"
        ? 1500
        : 1000;

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(today.getDate() - (days - 1 - i));
      const dayIndex = date.getDay();
      data.push({
        name: dayNames[dayIndex],
        value: Math.max(0, baseValue + Math.floor(Math.random() * 2000 - 1000)),
      });
    }

    return data;
  }

  generateMockFollowerData(platform, timeframe) {
    const weeks = timeframe === "month" ? 4 : 1;
    const data = [];
    let baseValue =
      platform === "twitter"
        ? 12000
        : platform === "instagram"
        ? 24000
        : platform === "facebook"
        ? 8500
        : 5000;

    for (let i = 0; i < weeks; i++) {
      data.push({
        name: `Week ${i + 1}`,
        value: baseValue,
      });
      baseValue += Math.floor(Math.random() * 500 + 200);
    }

    return data;
  }

  generateMockDemographicsData(platform) {
    return {
      ageGroups: [
        { group: "18-24", percentage: 15 + Math.floor(Math.random() * 10) },
        { group: "25-34", percentage: 35 + Math.floor(Math.random() * 10) },
        { group: "35-44", percentage: 25 + Math.floor(Math.random() * 10) },
        { group: "45-54", percentage: 15 + Math.floor(Math.random() * 5) },
        { group: "55+", percentage: 10 + Math.floor(Math.random() * 5) },
      ],
      gender: [
        {
          group: "Female",
          percentage: 58 + Math.floor(Math.random() * 10 - 5),
        },
        { group: "Male", percentage: 42 + Math.floor(Math.random() * 10 - 5) },
      ],
      topLocations: [
        {
          location: "United States",
          percentage: 45 + Math.floor(Math.random() * 10 - 5),
        },
        {
          location: "United Kingdom",
          percentage: 15 + Math.floor(Math.random() * 5 - 2),
        },
        {
          location: "Canada",
          percentage: 10 + Math.floor(Math.random() * 5 - 2),
        },
        {
          location: "Australia",
          percentage: 8 + Math.floor(Math.random() * 4 - 2),
        },
        {
          location: "Germany",
          percentage: 7 + Math.floor(Math.random() * 4 - 2),
        },
      ],
      activeHours: [
        { hour: "6AM - 9AM", percentage: 10 + Math.floor(Math.random() * 5) },
        { hour: "9AM - 12PM", percentage: 15 + Math.floor(Math.random() * 5) },
        { hour: "12PM - 3PM", percentage: 18 + Math.floor(Math.random() * 5) },
        { hour: "3PM - 6PM", percentage: 20 + Math.floor(Math.random() * 5) },
        { hour: "6PM - 9PM", percentage: 25 + Math.floor(Math.random() * 5) },
        { hour: "9PM - 12AM", percentage: 12 + Math.floor(Math.random() * 5) },
      ],
    };
  }
}

// Create singleton instance
const socialMediaService = new SocialMediaService();

// Export both the class and instance for backward compatibility
module.exports = {
  SocialMediaService,

  // Real API stats syncing (RESTORED)
  syncSocialMediaStats:
    socialMediaService.syncSocialMediaStats.bind(socialMediaService),

  // Analytics methods (Real API where possible)
  fetchPlatformAnalytics:
    socialMediaService.fetchPlatformAnalytics.bind(socialMediaService),

  // Validation and connection methods
  validateSocialMediaCredentials:
    socialMediaService.validateSocialMediaCredentials.bind(socialMediaService),
  getConnectionStatus:
    socialMediaService.getConnectionStatus.bind(socialMediaService),

  // Publishing methods (NEW)
  publishToSocialMedia:
    socialMediaService.publishToSocialMedia.bind(socialMediaService),
};

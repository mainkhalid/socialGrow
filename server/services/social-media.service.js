const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const OAuth = require("oauth-1.0a");
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
   * Sync social media stats with improved error handling and retry logic
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
   * Get Twitter/X statistics with better error handling
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
   * Get Instagram statistics with improved page handling
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
            const account = await Account.findOne({
              platform: "instagram",
              "profileData.instagramBusinessAccount.id": { $exists: false },
            });

            if (account) {
              account.profileData = {
                ...account.profileData,
                instagramBusinessAccount: page.instagram_business_account.id,
                pageAccessToken: page.access_token,
                pageId: page.id,
                pageName: page.name,
              };
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
   * Get Facebook Page statistics with better error handling
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
   * Enhanced credential validation with better error messages
   */
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
      };
    }
  }

  /**
   * Enhanced analytics fetching with error handling
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
  syncSocialMediaStats:
    socialMediaService.syncSocialMediaStats.bind(socialMediaService),
  fetchPlatformAnalytics:
    socialMediaService.fetchPlatformAnalytics.bind(socialMediaService),
  validateSocialMediaCredentials:
    socialMediaService.validateSocialMediaCredentials.bind(socialMediaService),
  getConnectionStatus:
    socialMediaService.getConnectionStatus.bind(socialMediaService),
};

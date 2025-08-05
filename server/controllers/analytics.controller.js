const Account = require("../models/account.model");
const Post = require("../models/post.model");
const {
  fetchPlatformAnalytics,
  syncSocialMediaStats,
} = require("../services/social-media.service");
const mongoose = require("mongoose");

// Get comprehensive dashboard analytics
const getDashboardAnalytics = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { timeframe = "week" } = req.query;

    // Ensure userId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: "Invalid user ID format",
        error: "User ID must be a valid MongoDB ObjectId",
      });
    }

    // Get all connected accounts
    const connectedAccounts = await Account.find({
      userId: new mongoose.Types.ObjectId(userId),
      connected: true,
    });

    if (connectedAccounts.length === 0) {
      return res.status(404).json({
        message: "No connected accounts found",
        data: {
          totalAccounts: 0,
          totalFollowers: 0,
          totalPosts: 0,
          avgEngagement: 0,
          platformBreakdown: [],
          engagementTrend: [],
          followerGrowth: [],
        },
      });
    }

    // Sync latest stats for all accounts
    const accountStats = [];
    let totalFollowers = 0;
    let totalPosts = 0;
    let totalEngagement = 0;

    for (const account of connectedAccounts) {
      try {
        // Pass the MongoDB ObjectId userId, not the social media platform ID
        const stats = await syncSocialMediaStats(account.platform, account._id);

        // Update account with fresh stats
        account.stats = {
          ...account.stats,
          followers: stats.followers,
          following: stats.following,
          posts: stats.posts,
          engagement: stats.engagement,
          lastSynced: new Date(),
        };
        await account.save();

        accountStats.push({
          platform: account.platform,
          username: account.username,
          displayName: account.displayName || stats.displayName,
          followers: stats.followers,
          posts: stats.posts,
          engagement: stats.engagement,
          verified: stats.verified,
          profileImage: stats.profileImageUrl,
        });

        totalFollowers += stats.followers;
        totalPosts += stats.posts;
        totalEngagement += stats.engagement;
      } catch (error) {
        console.error(`Error syncing ${account.platform}:`, error.message);
        // Use cached stats if API fails
        if (account.stats) {
          accountStats.push({
            platform: account.platform,
            username: account.username,
            displayName: account.displayName,
            followers: account.stats.followers || 0,
            posts: account.stats.posts || 0,
            engagement: account.stats.engagement || 0,
            verified: account.stats.verified || false,
            profileImage: account.stats.profileImageUrl,
            cached: true,
          });

          totalFollowers += account.stats.followers || 0;
          totalPosts += account.stats.posts || 0;
          totalEngagement += account.stats.engagement || 0;
        }
      }
    }

    const avgEngagement =
      connectedAccounts.length > 0
        ? (totalEngagement / connectedAccounts.length).toFixed(2)
        : 0;

    // Get engagement trend data
    const engagementTrend = await getEngagementTrend(
      connectedAccounts,
      timeframe
    );

    // Get follower growth data
    const followerGrowth = await getFollowerGrowthTrend(
      connectedAccounts,
      timeframe
    );

    // Get top performing content
    const topContent = await getTopPerformingContent(userId, 5);

    const dashboardData = {
      summary: {
        totalAccounts: connectedAccounts.length,
        totalFollowers,
        totalPosts,
        avgEngagement: parseFloat(avgEngagement),
      },
      platformBreakdown: accountStats,
      engagementTrend,
      followerGrowth,
      topContent,
      lastUpdated: new Date().toISOString(),
    };

    res.json(dashboardData);
  } catch (error) {
    console.error("Dashboard analytics error:", error);
    res.status(500).json({
      message: "Server error",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal error",
    });
  }
};

// Get engagement data for a platform
const getEngagementData = async (req, res) => {
  try {
    const { platform } = req.params;
    const { timeframe = "week" } = req.query;
    const userId = req.user.userId;

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const account = await Account.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      platform,
      connected: true,
    });

    if (!account) {
      return res
        .status(404)
        .json({ message: "No connected account found for this platform" });
    }

    // Fetch engagement data from social media API
    const engagementData = await fetchPlatformAnalytics(
      platform,
      "engagement",
      timeframe,
      account.apiKey || account.facebookAppId,
      account.apiSecret || account.facebookAppSecret,
      account.accessToken,
      account.accessTokenSecret
    );

    // Get published posts for additional context
    const recentPosts = await Post.find({
      userId: new mongoose.Types.ObjectId(userId),
      platform,
      status: "published",
      publishedAt: {
        $gte: new Date(Date.now() - getTimeframeMs(timeframe)),
      },
    })
      .sort({ publishedAt: -1 })
      .limit(10);

    const response = {
      platform,
      timeframe,
      data: engagementData,
      recentPosts: recentPosts.map((post) => ({
        id: post._id,
        content:
          post.content.substring(0, 100) +
          (post.content.length > 100 ? "..." : ""),
        publishedAt: post.publishedAt,
        analytics: post.analytics,
      })),
      lastUpdated: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error("Get engagement data error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getFollowerData = async (req, res) => {
  try {
    const userId = req.user.userId;
    const platform = req.params.platform?.toLowerCase();

    if (!platform || !["twitter", "facebook", "instagram"].includes(platform)) {
      return res.status(400).json({ error: "Invalid or missing platform" });
    }

    const account = await Account.findOne({ userId, platform });

    if (!account) {
      return res.status(404).json({ error: `No ${platform} account found.` });
    }

    const stats = await syncSocialMediaStats(platform, account._id);

    if (!stats) {
      return res.status(500).json({ error: "Failed to sync follower stats." });
    }

    return res.status(200).json({
      platform,
      followers: stats.followers ?? 0,
      following: stats.following ?? 0,
      posts: stats.posts ?? 0,
      lastSynced: account.stats?.lastSyncedAt ?? null,
    });
  } catch (error) {
    console.error(`Error fetching follower data: ${error.message}`);
    return res.status(500).json({ error: "Server error" });
  }
};


const getContentPerformance = async (req, res) => {
  try {
    const { platform } = req.params;
    const { limit = 10, sortBy = "publishedAt", order = "desc" } = req.query;
    const userId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    // Build sort object
    const sortObj = {};
    if (sortBy === "engagement") {
      sortObj["analytics.totalEngagement"] = order === "desc" ? -1 : 1;
    } else {
      sortObj[sortBy] = order === "desc" ? -1 : 1;
    }

    // Find published posts for this platform
    const posts = await Post.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          platform,
          status: "published",
        },
      },
      {
        $addFields: {
          "analytics.totalEngagement": {
            $add: [
              { $ifNull: ["$analytics.likes", 0] },
              { $ifNull: ["$analytics.comments", 0] },
              { $ifNull: ["$analytics.shares", 0] },
            ],
          },
        },
      },
      { $sort: sortObj },
      { $limit: parseInt(limit) },
    ]);

    // Format the response
    const contentPerformance = posts.map((post) => ({
      id: post._id,
      content:
        post.content.substring(0, 150) +
        (post.content.length > 150 ? "..." : ""),
      publishedAt: post.publishedAt,
      analytics: {
        likes: post.analytics?.likes || 0,
        comments: post.analytics?.comments || 0,
        shares: post.analytics?.shares || 0,
        totalEngagement: post.analytics?.totalEngagement || 0,
        impressions: post.analytics?.impressions || 0,
        reach: post.analytics?.reach || 0,
      },
      mediaUrls: post.mediaUrls || [],
      hashtags: post.hashtags || [],
    }));

    // Calculate performance insights
    const totalPosts = contentPerformance.length;
    const avgEngagement =
      totalPosts > 0
        ? contentPerformance.reduce(
            (sum, post) => sum + post.analytics.totalEngagement,
            0
          ) / totalPosts
        : 0;

    const bestPerforming =
      contentPerformance.length > 0 ? contentPerformance[0] : null;

    res.json({
      platform,
      summary: {
        totalPosts,
        avgEngagement: Math.round(avgEngagement),
        bestPerforming,
      },
      posts: contentPerformance,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get content performance error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get audience demographics data
const getAudienceDemographics = async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.userId;

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const account = await Account.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      platform,
      connected: true,
    });

    if (!account) {
      return res
        .status(404)
        .json({ message: "No connected account found for this platform" });
    }

    // Fetch demographics data from social media API
    const demographicsData = await fetchPlatformAnalytics(
      platform,
      "demographics",
      null,
      account.apiKey || account.facebookAppId,
      account.apiSecret || account.facebookAppSecret,
      account.accessToken,
      account.accessTokenSecret
    );

    res.json({
      platform,
      demographics: demographicsData,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get audience demographics error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get analytics comparison between platforms
const getComparisonAnalytics = async (req, res) => {
  try {
    const { platforms, metric = "engagement", timeframe = "week" } = req.query;
    const platformList = platforms ? platforms.split(",") : [];
    const userId = req.user.userId;

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    if (platformList.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one platform is required" });
    }

    const comparisonData = [];

    for (const platform of platformList) {
      const account = await Account.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        platform,
        connected: true,
      });

      if (account) {
        try {
          const data = await fetchPlatformAnalytics(
            platform,
            metric,
            timeframe,
            account.apiKey || account.facebookAppId,
            account.apiSecret || account.facebookAppSecret,
            account.accessToken,
            account.accessTokenSecret
          );

          comparisonData.push({
            platform,
            username: account.username,
            data,
            followers: account.stats?.followers || 0,
          });
        } catch (error) {
          console.warn(`Could not fetch ${platform} analytics:`, error.message);
        }
      }
    }

    res.json({
      metric,
      timeframe,
      platforms: comparisonData,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get comparison analytics error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Helper functions
const getEngagementTrend = async (accounts, timeframe) => {
  // This would ideally fetch historical data from a database
  // For now, we'll generate trend data based on current stats
  const days = timeframe === "month" ? 30 : timeframe === "week" ? 7 : 1;
  const trendData = [];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));

    const dayData = {
      date: date.toISOString().split("T")[0],
      engagement: Math.floor(Math.random() * 1000 + 500), // Mock data
    };

    trendData.push(dayData);
  }

  return trendData;
};

const getFollowerGrowthTrend = async (accounts, timeframe) => {
  const weeks = timeframe === "month" ? 4 : 2;
  const trendData = [];

  let baseFollowers = accounts.reduce(
    (sum, acc) => sum + (acc.stats?.followers || 0),
    0
  );

  for (let i = 0; i < weeks; i++) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - (weeks - i) * 7);

    trendData.push({
      week: `Week ${i + 1}`,
      followers: Math.max(
        0,
        baseFollowers - (weeks - i - 1) * Math.floor(Math.random() * 100 + 50)
      ),
      date: weekStart.toISOString().split("T")[0],
    });
  }

  return trendData;
};

const getTopPerformingContent = async (userId, limit) => {
  try {
    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return [];
    }

    const topPosts = await Post.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          status: "published",
        },
      },
      {
        $addFields: {
          totalEngagement: {
            $add: [
              { $ifNull: ["$analytics.likes", 0] },
              { $ifNull: ["$analytics.comments", 0] },
              { $ifNull: ["$analytics.shares", 0] },
            ],
          },
        },
      },
      { $sort: { totalEngagement: -1 } },
      { $limit: limit },
    ]);

    return topPosts.map((post) => ({
      id: post._id,
      platform: post.platform,
      content:
        post.content.substring(0, 100) +
        (post.content.length > 100 ? "..." : ""),
      publishedAt: post.publishedAt,
      totalEngagement: post.totalEngagement,
      analytics: post.analytics,
    }));
  } catch (error) {
    console.error("Error getting top performing content:", error);
    return [];
  }
};

const getTimeframeMs = (timeframe) => {
  switch (timeframe) {
    case "day":
      return 24 * 60 * 60 * 1000;
    case "week":
      return 7 * 24 * 60 * 60 * 1000;
    case "month":
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
};

module.exports = {
  getDashboardAnalytics,
  getEngagementData,
  getFollowerData,
  getContentPerformance,
  getAudienceDemographics,
  getComparisonAnalytics,
};

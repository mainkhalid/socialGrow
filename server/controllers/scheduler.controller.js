const Post = require('../models/post.model');
const Account = require('../models/account.model');
const User = require('../models/user.model');
const { getStats, resetStats, manualTrigger } = require('../services/scheduler.service');
const { getConnectionStatus } = require('../services/social-media.service');

// Get all scheduled posts for a user
const getPosts = async (req, res) => {
  try {
    const { platform, status, limit = 50, offset = 0 } = req.query;
    const query = { userId: req.user.userId };
    
    if (platform) {
      query.platform = platform;
    }
    if (status) {
      query.status = status;
    }

    const posts = await Post.find(query)
      .populate('accountId', 'platform username connected apiKey apiSecret accessToken accessTokenSecret facebookAppId facebookAppSecret') // Include ALL required fields
      .sort({ scheduledDate: 1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    // Add connection status to each post
    const postsWithConnectionStatus = await Promise.all(
      posts.map(async (post) => {
        let connectionHealthy = false;
        
        if (post.accountId && post.accountId.connected) {
          try {
            // Use the correct credentials based on platform
            const connectionStatus = await getConnectionStatus(
              post.accountId.platform,
              post.accountId.apiKey || post.accountId.facebookAppId,
              post.accountId.apiSecret || post.accountId.facebookAppSecret,
              post.accountId.accessToken,
              post.accountId.accessTokenSecret
            );
            connectionHealthy = connectionStatus.connected;
          } catch (error) {
            console.error(`Connection check failed for account ${post.accountId._id}:`, error.message);
          }
        }

        return {
          ...post.toObject(),
          connectionHealthy,
          canPublish: post.accountId?.connected && connectionHealthy && post.status === 'scheduled'
        };
      })
    );

    res.json({
      posts: postsWithConnectionStatus,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: await Post.countDocuments(query)
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new scheduled post with enhanced validation
const createPost = async (req, res) => {
  try {
    const { accountId, content, mediaUrls, scheduledDate, platform } = req.body;

    // Validate required fields
    if (!accountId || !content || !scheduledDate || !platform) {
      return res.status(400).json({ 
        message: 'Missing required fields: accountId, content, scheduledDate, and platform are required' 
      });
    }

    // Validate account ownership and connection
    const account = await Account.findOne({
      _id: accountId,
      userId: req.user.userId
    });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    if (!account.connected) {
      return res.status(400).json({ 
        message: 'Account is disconnected. Please reconnect your account before scheduling posts.' 
      });
    }

    // Validate account connection health
    try {
      const connectionStatus = await getConnectionStatus(
        account.platform,
        account.apiKey,
        account.apiSecret,
        account.accessToken,
        account.accessTokenSecret
      );

      if (!connectionStatus.connected) {
        return res.status(400).json({ 
          message: 'Account connection is unhealthy. Please check your account settings.',
          connectionError: connectionStatus.message
        });
      }
    } catch (error) {
      return res.status(400).json({ 
        message: 'Unable to verify account connection. Please reconnect your account.',
        connectionError: error.message
      });
    }

    // Validate platform matches account
    if (platform.toLowerCase() !== account.platform.toLowerCase()) {
      return res.status(400).json({ 
        message: 'Platform mismatch. Selected account does not match the specified platform.' 
      });
    }

    // Validate scheduled date
    const scheduleDate = new Date(scheduledDate);
    const now = new Date();
    
    if (scheduleDate <= now) {
      return res.status(400).json({ 
        message: 'Scheduled date must be in the future' 
      });
    }

    // Validate content for platform
    const contentValidation = validateContentForPlatform(content, platform);
    if (!contentValidation.valid) {
      return res.status(400).json({ 
        message: contentValidation.message 
      });
    }

    // Check user's plan limits
    const user = await User.findById(req.user.userId);
    if (user.planUsage.posts.used >= user.planUsage.posts.total) {
      return res.status(403).json({ 
        message: 'Post limit reached for your plan. Please upgrade to schedule more posts.' 
      });
    }

    // Create new post
    const newPost = new Post({
      userId: req.user.userId,
      accountId,
      platform: platform.toLowerCase(),
      content: content.trim(),
      mediaUrls: mediaUrls || [],
      scheduledDate: scheduleDate,
      status: 'scheduled',
      createdAt: new Date()
    });

    await newPost.save();

    // Update user's post usage
    user.planUsage.posts.used += 1;
    await user.save();

    // Return post with account info
    const populatedPost = await Post.findById(newPost._id)
      .populate('accountId', 'platform username connected');

    res.status(201).json({
      ...populatedPost.toObject(),
      canPublish: true // Just validated connection
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update a scheduled post with connection validation
const updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, mediaUrls, scheduledDate } = req.body;

    const post = await Post.findOne({
      _id: postId,
      userId: req.user.userId
    }).populate('accountId');

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Only allow updates to scheduled posts
    if (post.status !== 'scheduled') {
      return res.status(400).json({ 
        message: 'Cannot update published or failed posts' 
      });
    }

    // Validate account is still connected if updating
    if (post.accountId && !post.accountId.connected) {
      return res.status(400).json({ 
        message: 'Associated account is disconnected. Please reconnect the account before updating the post.' 
      });
    }

    // Validate content if provided
    if (content) {
      const contentValidation = validateContentForPlatform(content, post.platform);
      if (!contentValidation.valid) {
        return res.status(400).json({ 
          message: contentValidation.message 
        });
      }
      post.content = content.trim();
    }

    // Validate scheduled date if provided
    if (scheduledDate) {
      const scheduleDate = new Date(scheduledDate);
      const now = new Date();
      
      if (scheduleDate <= now) {
        return res.status(400).json({ 
          message: 'Scheduled date must be in the future' 
        });
      }
      post.scheduledDate = scheduleDate;
    }

    if (mediaUrls) {
      post.mediaUrls = mediaUrls;
    }

    post.updatedAt = new Date();
    await post.save();

    res.json(post);
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a scheduled post
const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findOne({
      _id: postId,
      userId: req.user.userId
    });

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // If post was scheduled but not yet published, refund the usage
    if (post.status === 'scheduled') {
      const user = await User.findById(req.user.userId);
      if (user.planUsage.posts.used > 0) {
        user.planUsage.posts.used -= 1;
        await user.save();
      }
    }

    await Post.deleteOne({ _id: postId });
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get analytics for a specific post
const getPostAnalytics = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findOne({
      _id: postId,
      userId: req.user.userId
    }).populate('accountId');

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Only published posts have analytics
    if (post.status !== 'published') {
      return res.status(400).json({ 
        message: 'Analytics are only available for published posts' 
      });
    }

    // For published posts, try to refresh analytics from social media API
    if (post.externalPostId && post.accountId?.connected) {
      try {
        const updatedAnalytics = await fetchPostAnalytics(
          post.platform,
          post.externalPostId,
          post.accountId.apiKey,
          post.accountId.apiSecret,
          post.accountId.accessToken,
          post.accountId.accessTokenSecret
        );
        
        post.analytics = updatedAnalytics;
        post.analyticsUpdatedAt = new Date();
        await post.save();
      } catch (error) {
        console.error('Refresh post analytics error:', error);
        // Continue with existing analytics if refresh fails
      }
    }

    res.json({
      ...post.analytics,
      lastUpdated: post.analyticsUpdatedAt,
      externalPostId: post.externalPostId
    });
  } catch (error) {
    console.error('Get post analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get scheduler status and statistics
const getSchedulerStatus = async (req, res) => {
  try {
    const stats = getStats();
    
    // Get posts by status for the user
    const postStats = await Post.aggregate([
      { $match: { userId: req.user.userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const postsByStatus = postStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    // Get upcoming scheduled posts
    const upcomingPosts = await Post.countDocuments({
      userId: req.user.userId,
      status: 'scheduled',
      scheduledDate: { $gte: new Date() }
    });

    // Get overdue posts (scheduled but not published)
    const overduePosts = await Post.countDocuments({
      userId: req.user.userId,
      status: 'scheduled',
      scheduledDate: { $lt: new Date() }
    });

    res.json({
      schedulerStats: stats,
      userPostStats: {
        ...postsByStatus,
        upcoming: upcomingPosts,
        overdue: overduePosts
      }
    });
  } catch (error) {
    console.error('Get scheduler status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Manual trigger for scheduler (admin/testing)
const triggerScheduler = async (req, res) => {
  try {
    // This endpoint should be protected for admin users only
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const stats = await manualTrigger();
    
    res.json({
      message: 'Scheduler triggered manually',
      stats
    });
  } catch (error) {
    console.error('Manual scheduler trigger error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get connection health for all user accounts
const getConnectionHealth = async (req, res) => {
  try {
    const accounts = await Account.find({ 
      userId: req.user.userId 
    }).select('platform username connected apiKey apiSecret accessToken accessTokenSecret');

    const healthChecks = await Promise.all(
      accounts.map(async (account) => {
        let connectionStatus = {
          connected: false,
          message: 'Unknown error'
        };

        if (account.connected) {
          try {
            connectionStatus = await getConnectionStatus(
              account.platform,
              account.apiKey,
              account.apiSecret,
              account.accessToken,
              account.accessTokenSecret
            );
          } catch (error) {
            connectionStatus = {
              connected: false,
              message: error.message
            };
          }
        } else {
          connectionStatus = {
            connected: false,
            message: 'Account marked as disconnected'
          };
        }

        return {
          accountId: account._id,
          platform: account.platform,
          username: account.username,
          markedAsConnected: account.connected,
          actuallyConnected: connectionStatus.connected,
          healthMessage: connectionStatus.message,
          healthy: account.connected && connectionStatus.connected
        };
      })
    );

    const summary = {
      total: accounts.length,
      healthy: healthChecks.filter(h => h.healthy).length,
      unhealthy: healthChecks.filter(h => !h.healthy).length,
      disconnected: healthChecks.filter(h => !h.markedAsConnected).length
    };

    res.json({
      accounts: healthChecks,
      summary
    });
  } catch (error) {
    console.error('Get connection health error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Helper function to validate content for platform
function validateContentForPlatform(content, platform) {
  if (!content || content.trim().length === 0) {
    return { valid: false, message: 'Content cannot be empty' };
  }

  const trimmedContent = content.trim();

  switch (platform.toLowerCase()) {
    case 'twitter':
      if (trimmedContent.length > 280) {
        return { 
          valid: false, 
          message: `Twitter posts must be 280 characters or less (current: ${trimmedContent.length})` 
        };
      }
      break;
    case 'instagram':
      if (trimmedContent.length > 2200) {
        return { 
          valid: false, 
          message: `Instagram captions must be 2200 characters or less (current: ${trimmedContent.length})` 
        };
      }
      break;
    case 'facebook':
      if (trimmedContent.length > 63206) {
        return { 
          valid: false, 
          message: `Facebook posts must be 63206 characters or less (current: ${trimmedContent.length})` 
        };
      }
      break;
    default:
      return { valid: false, message: 'Unsupported platform' };
  }

  return { valid: true, message: 'Content is valid' };
}

// Helper function (in a real app, this would be in a service file)
async function fetchPostAnalytics(platform, externalPostId, apiKey, apiSecret, accessToken, accessTokenSecret) {
  // This is a mock function - in a real app, this would fetch real analytics
  // from the social media platform's API
  return {
    likes: Math.floor(Math.random() * 500) + 10,
    comments: Math.floor(Math.random() * 50) + 1,
    shares: Math.floor(Math.random() * 100) + 1,
    impressions: Math.floor(Math.random() * 5000) + 100,
    engagementRate: (Math.random() * 10 + 0.5).toFixed(2),
    reach: Math.floor(Math.random() * 3000) + 50,
    clicks: Math.floor(Math.random() * 100) + 5
  };
}

module.exports = {
  getPosts,
  createPost,
  updatePost,
  deletePost,
  getPostAnalytics,
  getSchedulerStatus,
  triggerScheduler,
  getConnectionHealth
};
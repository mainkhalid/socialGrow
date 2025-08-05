const cron = require('node-cron');
const Post = require('../models/post.model');
const Account = require('../models/account.model');
const { 
  getConnectionStatus, 
  validateSocialMediaCredentials 
} = require('./social-media.service');

/**
 * Enhanced scheduler service with manual control
 */
class SchedulerService {
  constructor() {
    this.isRunning = false;
    this.isInitialized = false;
    this.cronJob = null;
    this.lastRunTime = null;
    this.stats = {
      totalRuns: 0,
      postsProcessed: 0,
      postsPublished: 0,
      postsFailed: 0,
      connectionErrors: 0
    };
  }

  /**
   * Initialize the scheduler service
   */
  initScheduler() {
    if (this.isInitialized) {
      console.log('⚠️ Scheduler already initialized');
      return;
    }

    // Run every minute to check for posts that need to be published
    this.cronJob = cron.schedule('* * * * *', async () => {
      if (this.isRunning) {
        console.log('⏭️ Scheduler already running, skipping this cycle');
        return;
      }

      try {
        this.isRunning = true;
        this.lastRunTime = new Date();
        this.stats.totalRuns++;
        
        console.log(`🔄 [${this.lastRunTime.toISOString()}] Checking for scheduled posts to publish...`);
        await this.processScheduledPosts();
      } catch (error) {
        console.error('❌ Error processing scheduled posts:', error);
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: false // Don't start immediately
    });
    
    this.isInitialized = true;
    console.log('✅ Post scheduler initialized (not started)');
  }

  /**
   * Start the scheduler
   */
  startScheduler() {
    if (!this.isInitialized) {
      this.initScheduler();
    }
    
    if (this.cronJob && !this.cronJob.running) {
      this.cronJob.start();
      console.log('▶️ Scheduler started');
    } else {
      console.log('⚠️ Scheduler is already running');
    }
  }

  /**
   * Stop the scheduler
   */
  stopScheduler() {
    if (this.cronJob && this.cronJob.running) {
      this.cronJob.stop();
      console.log('⏸️ Scheduler stopped');
    } else {
      console.log('⚠️ Scheduler is not running');
    }
  }

  /**
   * Check if scheduler should be running based on connected accounts
   */
  async autoManageScheduler() {
    try {
      const connectedAccounts = await Account.countDocuments({ connected: true });
      
      if (connectedAccounts > 0) {
        this.startScheduler();
        console.log(`🔄 Auto-started scheduler - ${connectedAccounts} connected account(s)`);
      } else {
        this.stopScheduler();
        console.log('⏸️ Auto-stopped scheduler - No connected accounts');
      }
    } catch (error) {
      console.error('❌ Error auto-managing scheduler:', error);
    }
  }

  /**
   * Process scheduled posts that are due for publishing
   */
  async processScheduledPosts() {
    const now = new Date();
    
    // Find posts that are scheduled and due for publishing
    const postsToPublish = await Post.find({
      status: 'scheduled',
      scheduledDate: { $lte: now }
    }).populate('accountId');

    console.log(`📋 Found ${postsToPublish.length} posts to publish`);
    this.stats.postsProcessed += postsToPublish.length;

    if (postsToPublish.length === 0) {
      return;
    }

    // Group posts by account to batch connection checks
    const postsByAccount = this.groupPostsByAccount(postsToPublish);
    
    // Process each account's posts
    for (const [accountId, posts] of Object.entries(postsByAccount)) {
      await this.processAccountPosts(accountId, posts);
    }

    console.log(`📊 Batch processing complete: ${this.stats.postsPublished} published, ${this.stats.postsFailed} failed`);
  }

  /**
   * Group posts by account for efficient processing
   */
  groupPostsByAccount(posts) {
    const grouped = {};
    
    posts.forEach(post => {
      const accountId = post.accountId._id.toString();
      if (!grouped[accountId]) {
        grouped[accountId] = [];
      }
      grouped[accountId].push(post);
    });
    
    return grouped;
  }

  /**
   * Process all posts for a specific account
   */
  async processAccountPosts(accountId, posts) {
    const account = posts[0].accountId; // All posts have the same account
    
    console.log(`🔍 Processing ${posts.length} posts for ${account.platform} account: ${account.username}`);

    // First, validate account exists and basic requirements
    if (!account) {
      console.error(`❌ Account ${accountId} not found`);
      await this.markPostsAsFailed(posts, 'Account not found');
      return;
    }

    // Check if account is marked as connected
    if (!account.connected) {
      console.error(`❌ Account ${account.username} (${account.platform}) is marked as disconnected`);
      await this.markPostsAsFailed(posts, 'Account disconnected');
      return;
    }

    // Validate account credentials are present
    if (!this.hasRequiredCredentials(account)) {
      console.error(`❌ Account ${account.username} (${account.platform}) missing required credentials`);
      await this.markPostsAsFailed(posts, 'Missing API credentials');
      await this.disconnectAccount(account);
      return;
    }

    // Test actual connection to social media platform
    let connectionStatus;
    try {
      connectionStatus = await getConnectionStatus(
        account.platform,
        account.apiKey,
        account.apiSecret,
        account.accessToken,
        account.accessTokenSecret
      );
    } catch (error) {
      console.error(`❌ Connection test failed for ${account.username} (${account.platform}):`, error.message);
      await this.markPostsAsFailed(posts, `Connection test failed: ${error.message}`);
      await this.disconnectAccount(account);
      this.stats.connectionErrors++;
      return;
    }

    // Check if connection is healthy
    if (!connectionStatus.connected) {
      console.error(`❌ Account ${account.username} (${account.platform}) connection unhealthy: ${connectionStatus.message}`);
      await this.markPostsAsFailed(posts, `Connection unhealthy: ${connectionStatus.message}`);
      await this.disconnectAccount(account);
      this.stats.connectionErrors++;
      return;
    }

    console.log(`✅ Account ${account.username} (${account.platform}) connection verified`);

    // Now process each post for this account
    for (const post of posts) {
      await this.processIndividualPost(post, account);
    }
  }

  /**
   * Check if account has required credentials for its platform
   */
  hasRequiredCredentials(account) {
    const { platform, apiKey, apiSecret, accessToken, accessTokenSecret } = account;
    
    switch (platform.toLowerCase()) {
      case 'twitter':
        return apiKey && apiSecret && accessToken && accessTokenSecret;
      case 'instagram':
      case 'facebook':
        return accessToken;
      default:
        return false;
    }
  }

  /**
   * Process an individual post
   */
  async processIndividualPost(post, account) {
    try {
      console.log(`📤 Publishing post ${post._id} to ${account.platform}...`);
      
      // Add additional validation for post content
      if (!this.validatePostContent(post)) {
        throw new Error('Invalid post content');
      }

      // Publish the post to social media
      const publishResult = await this.publishToSocialMedia(post, account);
      
      if (publishResult.success) {
        // Update post with published status and external ID
        post.status = 'published';
        post.publishedAt = new Date();
        post.externalPostId = publishResult.externalPostId;
        post.publishError = '';
        
        await post.save();
        
        console.log(`✅ Post ${post._id} published successfully`);
        this.stats.postsPublished++;
      } else {
        throw new Error(publishResult.error || 'Unknown publishing error');
      }
    } catch (error) {
      console.error(`❌ Error publishing post ${post._id}:`, error.message);
      
      // Mark as failed with detailed error
      post.status = 'failed';
      post.publishError = error.message;
      post.failedAt = new Date();
      
      await post.save();
      this.stats.postsFailed++;
    }
  }

  /**
   * Validate post content before publishing
   */
  validatePostContent(post) {
    // Check if post has content
    if (!post.content || post.content.trim().length === 0) {
      return false;
    }

    // Platform-specific validations
    switch (post.platform.toLowerCase()) {
      case 'twitter':
        return post.content.length <= 280; // Twitter character limit
      case 'instagram':
        return post.content.length <= 2200; // Instagram caption limit
      case 'facebook':
        return post.content.length <= 63206; // Facebook post limit
      default:
        return true;
    }
  }

  /**
   * Mark multiple posts as failed with the same reason
   */
  async markPostsAsFailed(posts, reason) {
    const failedAt = new Date();
    
    const updatePromises = posts.map(post => {
      post.status = 'failed';
      post.publishError = reason;
      post.failedAt = failedAt;
      this.stats.postsFailed++;
      return post.save();
    });
    
    await Promise.all(updatePromises);
    console.log(`❌ Marked ${posts.length} posts as failed: ${reason}`);
  }

  /**
   * Disconnect an account that has connection issues
   */
  async disconnectAccount(account) {
    try {
      account.connected = false;
      account.syncStatus = 'failed';
      account.syncError = 'Connection validation failed during scheduled publishing';
      account.lastSyncedAt = new Date();
      
      await account.save();
      
      console.log(`🔌 Disconnected account ${account.username} (${account.platform}) due to connection issues`);
      
      // Auto-manage scheduler after disconnection
      await this.autoManageScheduler();
    } catch (error) {
      console.error(`❌ Error disconnecting account ${account._id}:`, error.message);
    }
  }

  /**
   * Publish a post to the appropriate social media platform
   */
  async publishToSocialMedia(post, account) {
    // In a real implementation, this would use the actual social media APIs
    // For now, we'll simulate the publishing process with better error handling
    
    return new Promise((resolve) => {
      // Simulate network delay
      setTimeout(() => {
        // Simulate different types of failures
        const random = Math.random();
        
        if (random < 0.05) { // 5% rate limiting
          resolve({
            success: false,
            error: 'Rate limit exceeded. Please try again later.'
          });
        } else if (random < 0.08) { // 3% authentication errors
          resolve({
            success: false,
            error: 'Authentication failed. Please reconnect your account.'
          });
        } else if (random < 0.10) { // 2% content policy violations
          resolve({
            success: false,
            error: 'Content violates platform policies.'
          });
        } else { // 90% success rate
          resolve({
            success: true,
            externalPostId: `${account.platform}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            publishedAt: new Date(),
            platformResponse: {
              platform: account.platform,
              accountId: account._id,
              message: 'Post published successfully'
            }
          });
        }
      }, 1000 + Math.random() * 2000); // 1-3 second delay
    });
  }

  /**
   * Get scheduler statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      isInitialized: this.isInitialized,
      schedulerActive: this.cronJob ? this.cronJob.running : false,
      lastRunTime: this.lastRunTime,
      uptime: this.lastRunTime ? new Date() - this.lastRunTime : 0
    };
  }

  /**
   * Reset scheduler statistics
   */
  resetStats() {
    this.stats = {
      totalRuns: 0,
      postsProcessed: 0,
      postsPublished: 0,
      postsFailed: 0,
      connectionErrors: 0
    };
  }

  /**
   * Manual trigger for processing (useful for testing)
   */
  async manualTrigger() {
    if (this.isRunning) {
      throw new Error('Scheduler is already running');
    }

    console.log('🔄 Manual trigger initiated...');
    
    try {
      this.isRunning = true;
      await this.processScheduledPosts();
      return this.getStats();
    } finally {
      this.isRunning = false;
    }
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();

// Export both the class and methods for backward compatibility
module.exports = {
  SchedulerService,
  initScheduler: () => schedulerService.initScheduler(),
  startScheduler: () => schedulerService.startScheduler(),
  stopScheduler: () => schedulerService.stopScheduler(),
  autoManageScheduler: () => schedulerService.autoManageScheduler(),
  getStats: () => schedulerService.getStats(),
  resetStats: () => schedulerService.resetStats(),
  manualTrigger: () => schedulerService.manualTrigger()
};
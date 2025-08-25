const cron = require('node-cron');
const Post = require('../models/post.model');
const Account = require('../models/account.model');
const { 
  getConnectionStatus, 
  validateSocialMediaCredentials,
  publishToSocialMedia // Import the real publishing service
} = require('./social-media.service');

/**
 * Enhanced scheduler service with real social media publishing
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
      connectionErrors: 0,
      tokenExpiredErrors: 0,
      rateLimitErrors: 0,
      contentPolicyErrors: 0,
      duplicateContentErrors: 0,
      networkErrors: 0
    };
    this.connectionCache = new Map(); // Cache connection statuses
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
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
        
        console.log(`🔥 [${this.lastRunTime.toISOString()}] Checking for scheduled posts to publish...`);
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
      const connectedAccounts = await Account.countDocuments({ 
        connected: true,
        // Add additional check for healthy connections
        $or: [
          { connectionHealthy: { $ne: false } }, // Not explicitly marked as unhealthy
          { connectionHealthy: { $exists: false } } // For backward compatibility
        ]
      });
      
      if (connectedAccounts > 0) {
        this.startScheduler();
        console.log(`🔥 Auto-started scheduler - ${connectedAccounts} connected account(s)`);
      } else {
        this.stopScheduler();
        console.log('⏸️ Auto-stopped scheduler - No healthy connected accounts');
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
    
    try {
      // Find posts that are scheduled and due for publishing
      const postsToPublish = await Post.find({
        status: 'scheduled',
        scheduledDate: { $lte: now }
      }).populate({
        path: 'accountId',
        match: { connected: true } // Only get posts for connected accounts
      });

      // Filter out posts where accountId is null (disconnected accounts)
      const validPosts = postsToPublish.filter(post => post.accountId !== null);
      
      console.log(`📋 Found ${validPosts.length} posts to publish (${postsToPublish.length - validPosts.length} filtered out due to disconnected accounts)`);
      this.stats.postsProcessed += validPosts.length;

      if (validPosts.length === 0) {
        return;
      }

      // Group posts by account to batch connection checks
      const postsByAccount = this.groupPostsByAccount(validPosts);
      
      // Process each account's posts
      for (const [accountId, posts] of Object.entries(postsByAccount)) {
        await this.processAccountPosts(accountId, posts);
      }

      console.log(`📊 Batch processing complete: ${this.stats.postsPublished} published, ${this.stats.postsFailed} failed`);
    } catch (error) {
      console.error('❌ Error in processScheduledPosts:', error);
      throw error;
    }
  }

  /**
   * Group posts by account for efficient processing
   */
  groupPostsByAccount(posts) {
    const grouped = {};
    
    posts.forEach(post => {
      if (!post.accountId || !post.accountId._id) {
        console.warn(`⚠️ Post ${post._id} has invalid accountId, skipping`);
        return;
      }
      
      const accountId = post.accountId._id.toString();
      if (!grouped[accountId]) {
        grouped[accountId] = [];
      }
      grouped[accountId].push(post);
    });
    
    return grouped;
  }

  /**
   * Check cached connection status or perform fresh check
   */
  async getCachedConnectionStatus(account) {
    const cacheKey = `${account._id.toString()}-${account.platform}`;
    const cached = this.connectionCache.get(cacheKey);
    
    // Use cached status if it exists and is not expired
    if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
      console.log(`📦 Using cached connection status for ${account.username} (${account.platform})`);
      return cached.status;
    }
    
    // Perform fresh connection check
    console.log(`🔧 Testing fresh connection for ${account.username} (${account.platform})...`);
    
    try {
      const connectionStatus = await getConnectionStatus(
        account.platform,
        account.apiKey,
        account.apiSecret,
        account.accessToken,
        account.accessTokenSecret
      );
      
      // Cache the result
      this.connectionCache.set(cacheKey, {
        status: connectionStatus,
        timestamp: Date.now()
      });
      
      return connectionStatus;
    } catch (error) {
      // Cache the error result too (but with shorter timeout)
      const errorStatus = {
        connected: false,
        status: "error",
        message: error.message,
        lastChecked: new Date().toISOString(),
      };
      
      this.connectionCache.set(cacheKey, {
        status: errorStatus,
        timestamp: Date.now() - (this.cacheTimeout - 60000) // Cache errors for only 1 minute
      });
      
      return errorStatus;
    }
  }

  /**
   * Process all posts for a specific account with better error handling
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

    // Use cached connection status or perform fresh check
    const connectionStatus = await this.getCachedConnectionStatus(account);
    
    console.log(`📡 Connection status for ${account.username}:`, {
      connected: connectionStatus.connected,
      message: connectionStatus.message,
      errorCategory: connectionStatus.errorCategory
    });

    // Handle different types of connection issues
    if (!connectionStatus.connected) {
      return await this.handleConnectionError(posts, account, connectionStatus);
    }

    console.log(`✅ Account ${account.username} (${account.platform}) connection verified`);

    // Now process each post for this account
    for (const post of posts) {
      await this.processIndividualPost(post, account);
    }
  }

  /**
   * Handle connection errors with appropriate responses
   */
  async handleConnectionError(posts, account, connectionStatus) {
    const { errorCategory, message } = connectionStatus;
    
    switch (errorCategory) {
      case 'rate_limit':
        console.log(`⏰ Rate limit detected for ${account.username}, postponing posts...`);
        await this.postponePosts(posts, 'Rate limit - will retry later', 15); // 15 minutes
        this.stats.rateLimitErrors++;
        break;
        
      case 'authentication':
        console.log(`🔐 Authentication error detected for ${account.username}`);
        if (account.platform.toLowerCase() === 'facebook' && message.includes('access token')) {
          console.log(`🔄 Facebook token issue - marking for reconnection...`);
          await this.markAccountForReconnection(account, 'Facebook access token expired or invalid');
          await this.markPostsAsFailed(posts, `Authentication error: ${message}. Please reconnect your Facebook account.`);
        } else {
          await this.markPostsAsFailed(posts, `Authentication error: ${message}`);
          await this.disconnectAccount(account);
        }
        this.stats.tokenExpiredErrors++;
        break;
        
      case 'permissions':
        console.log(`🚫 Permission error for ${account.username}`);
        await this.markAccountForReconnection(account, 'Insufficient permissions - requires user action');
        await this.markPostsAsFailed(posts, `Permission error: ${message}. Please check your account permissions.`);
        break;
        
      case 'network':
        console.log(`🌐 Network error for ${account.username}, will retry later`);
        await this.postponePosts(posts, `Network error: ${message}`, 5); // 5 minutes
        this.stats.networkErrors++;
        break;
        
      default:
        console.error(`❌ Unknown connection error for ${account.username}: ${message}`);
        await this.markPostsAsFailed(posts, `Connection error: ${message}`);
        this.stats.connectionErrors++;
        break;
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
        return accessToken; // Facebook/Instagram only need access token
      default:
        console.warn(`⚠️ Unknown platform: ${platform}`);
        return false;
    }
  }

  /**
   * Process an individual post with REAL social media publishing
   */
  async processIndividualPost(post, account) {
    try {
      console.log(`📤 Publishing post ${post._id} to ${account.platform} (${account.username})...`);
      
      // Add additional validation for post content
      if (!this.validatePostContent(post, account.platform)) {
        throw new Error('Invalid post content');
      }

      // Use the REAL publishToSocialMedia service
      const publishResult = await publishToSocialMedia(post, account);
      
      if (publishResult.success) {
        // Update post with published status and external ID
        post.status = 'published';
        post.publishedAt = publishResult.publishedAt || new Date();
        post.externalPostId = publishResult.externalPostId;
        post.publishError = '';
        
        // Store platform response data if available
        if (publishResult.platformResponse) {
          post.platformResponse = publishResult.platformResponse;
        }
        
        await post.save();
        
        console.log(`✅ Post ${post._id} published successfully to ${account.platform}! External ID: ${publishResult.externalPostId}`);
        this.stats.postsPublished++;
        
        // Clear cached connection status on successful publish
        const cacheKey = `${account._id.toString()}-${account.platform}`;
        this.connectionCache.delete(cacheKey);
        
        // Update account health status on successful publish
        if (!account.connectionHealthy) {
          account.connectionHealthy = true;
          account.syncStatus = 'success';
          account.syncError = null;
          await account.save();
          console.log(`🔄 Account ${account.username} marked as healthy after successful publish`);
        }
        
      } else {
        // Handle specific error types from real API
        const errorCategory = publishResult.errorCategory || this.categorizePublishError(publishResult.error);
        this.updateErrorStats(errorCategory);
        
        // Handle different types of publishing errors
        await this.handlePublishError(post, account, publishResult.error, errorCategory);
      }
    } catch (error) {
      console.error(`❌ Error publishing post ${post._id}:`, error.message);
      
      // Categorize and handle the error
      const errorCategory = this.categorizePublishError(error.message);
      this.updateErrorStats(errorCategory);
      
      await this.handlePublishError(post, account, error.message, errorCategory);
    }
  }

  /**
   * Handle different types of publishing errors with appropriate responses
   */
  async handlePublishError(post, account, errorMessage, errorCategory) {
    switch (errorCategory) {
      case 'rate_limit':
        console.log(`⏰ Rate limit hit for post ${post._id}, postponing...`);
        post.status = 'scheduled';
        post.scheduledDate = new Date(Date.now() + 15 * 60 * 1000); // Retry in 15 minutes
        post.publishError = `Rate limited - retrying at ${post.scheduledDate.toISOString()}`;
        break;
        
      case 'authentication':
        console.log(`🔐 Authentication error for post ${post._id}`);
        post.status = 'failed';
        post.publishError = `Authentication failed: ${errorMessage}. Please reconnect your ${account.platform} account.`;
        post.failedAt = new Date();
        this.stats.postsFailed++;
        
        // Mark account for reconnection
        await this.markAccountForReconnection(account, errorMessage);
        break;
        
      case 'duplicate_content':
        console.log(`🔄 Duplicate content detected for post ${post._id}`);
        post.status = 'failed';
        post.publishError = `Duplicate content: ${errorMessage}`;
        post.failedAt = new Date();
        this.stats.postsFailed++;
        break;
        
      case 'content_policy':
        console.log(`🚫 Content policy violation for post ${post._id}`);
        post.status = 'failed';
        post.publishError = `Content policy violation: ${errorMessage}`;
        post.failedAt = new Date();
        this.stats.postsFailed++;
        break;
        
      case 'network':
        console.log(`🌐 Network error for post ${post._id}, will retry...`);
        post.status = 'scheduled';
        post.scheduledDate = new Date(Date.now() + 5 * 60 * 1000); // Retry in 5 minutes
        post.publishError = `Network error - retrying at ${post.scheduledDate.toISOString()}`;
        break;
        
      default:
        console.error(`❌ Unknown error for post ${post._id}: ${errorMessage}`);
        post.status = 'failed';
        post.publishError = errorMessage;
        post.failedAt = new Date();
        this.stats.postsFailed++;
        break;
    }
    
    await post.save();
  }

  /**
   * Categorize publishing errors
   */
  categorizePublishError(errorMessage) {
    const message = errorMessage?.toLowerCase() || '';
    
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limit';
    } else if (message.includes('authentication') || message.includes('unauthorized') || message.includes('token')) {
      return 'authentication';
    } else if (message.includes('duplicate') || message.includes('already posted')) {
      return 'duplicate_content';
    } else if (message.includes('policy') || message.includes('violat') || message.includes('restricted')) {
      return 'content_policy';
    } else if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return 'network';
    } else if (message.includes('permission') || message.includes('forbidden')) {
      return 'permissions';
    }
    
    return 'unknown';
  }

  /**
   * Update error statistics based on category
   */
  updateErrorStats(errorCategory) {
    switch (errorCategory) {
      case 'rate_limit':
        this.stats.rateLimitErrors++;
        break;
      case 'authentication':
        this.stats.tokenExpiredErrors++;
        break;
      case 'duplicate_content':
        this.stats.duplicateContentErrors++;
        break;
      case 'content_policy':
        this.stats.contentPolicyErrors++;
        break;
      case 'network':
        this.stats.networkErrors++;
        break;
      default:
        this.stats.connectionErrors++;
        break;
    }
  }

  /**
   * Validate post content before publishing
   */
  validatePostContent(post, platform = '') {
    // Check if post has content
    if (!post.content || post.content.trim().length === 0) {
      console.warn(`⚠️ Post ${post._id} has no content`);
      return false;
    }

    // Platform-specific validations
    const platformLower = platform.toLowerCase();
    switch (platformLower) {
      case 'twitter':
        if (post.content.length > 280) {
          console.warn(`⚠️ Twitter post ${post._id} exceeds 280 character limit (${post.content.length} chars)`);
          return false;
        }
        break;
      case 'instagram':
        if (post.content.length > 2200) {
          console.warn(`⚠️ Instagram post ${post._id} exceeds 2200 character limit (${post.content.length} chars)`);
          return false;
        }
        // Instagram requires at least one media file
        if (!post.mediaUrls || post.mediaUrls.length === 0) {
          console.warn(`⚠️ Instagram post ${post._id} requires at least one image or video`);
          return false;
        }
        break;
      case 'facebook':
        if (post.content.length > 63206) {
          console.warn(`⚠️ Facebook post ${post._id} exceeds character limit (${post.content.length} chars)`);
          return false;
        }
        break;
      default:
        console.warn(`⚠️ Unknown platform for validation: ${platform}`);
        break;
    }

    return true;
  }

  /**
   * Mark multiple posts as failed with the same reason
   */
  async markPostsAsFailed(posts, reason) {
    const failedAt = new Date();
    
    try {
      const updatePromises = posts.map(async (post) => {
        post.status = 'failed';
        post.publishError = reason;
        post.failedAt = failedAt;
        this.stats.postsFailed++;
        return await post.save();
      });
      
      await Promise.all(updatePromises);
      console.log(`❌ Marked ${posts.length} posts as failed: ${reason}`);
    } catch (error) {
      console.error('❌ Error marking posts as failed:', error);
    }
  }

  /**
   * Postpone posts (for rate limits or temporary issues)
   */
  async postponePosts(posts, reason, delayMinutes = 15) {
    const postponedUntil = new Date(Date.now() + delayMinutes * 60 * 1000);
    
    try {
      const updatePromises = posts.map(async (post) => {
        post.scheduledDate = postponedUntil;
        post.publishError = reason;
        return await post.save();
      });
      
      await Promise.all(updatePromises);
      console.log(`⏰ Postponed ${posts.length} posts until ${postponedUntil.toISOString()}: ${reason}`);
    } catch (error) {
      console.error('❌ Error postponing posts:', error);
    }
  }

  /**
   * Mark an account for reconnection with better status tracking
   */
  async markAccountForReconnection(account, reason) {
    try {
      account.connectionHealthy = false;
      account.syncStatus = 'needs_reconnection';
      account.syncError = reason;
      account.lastSyncedAt = new Date();
      
      // Don't disconnect immediately - give user a chance to reconnect
      // account.connected = false;
      
      await account.save();
      
      console.log(`🔄 Marked account ${account.username} (${account.platform}) for reconnection: ${reason}`);
      
      // Clear cache for this account
      const cacheKey = `${account._id.toString()}-${account.platform}`;
      this.connectionCache.delete(cacheKey);
      
    } catch (error) {
      console.error(`❌ Error marking account for reconnection ${account._id}:`, error.message);
    }
  }

  /**
   * Disconnect an account that has connection issues
   */
  async disconnectAccount(account) {
    try {
      account.connected = false;
      account.connectionHealthy = false;
      account.syncStatus = 'failed';
      account.syncError = 'Connection validation failed during scheduled publishing';
      account.lastSyncedAt = new Date();
      
      await account.save();
      
      console.log(`🔌 Disconnected account ${account.username} (${account.platform}) due to connection issues`);
      
      // Clear cache for this account
      const cacheKey = `${account._id.toString()}-${account.platform}`;
      this.connectionCache.delete(cacheKey);
      
      // Auto-manage scheduler after disconnection
      await this.autoManageScheduler();
    } catch (error) {
      console.error(`❌ Error disconnecting account ${account._id}:`, error.message);
    }
  }

  /**
   * Get scheduler statistics with additional metrics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      isInitialized: this.isInitialized,
      schedulerActive: this.cronJob ? this.cronJob.running : false,
      lastRunTime: this.lastRunTime,
      uptime: this.lastRunTime ? new Date() - this.lastRunTime : 0,
      cacheSize: this.connectionCache.size,
      cacheKeys: Array.from(this.connectionCache.keys()),
      successRate: this.stats.postsProcessed > 0 ? 
        ((this.stats.postsPublished / this.stats.postsProcessed) * 100).toFixed(2) + '%' : '0%'
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
      connectionErrors: 0,
      tokenExpiredErrors: 0,
      rateLimitErrors: 0,
      contentPolicyErrors: 0,
      duplicateContentErrors: 0,
      networkErrors: 0
    };
  }

  /**
   * Clear connection cache
   */
  clearCache() {
    this.connectionCache.clear();
    console.log('🧹 Connection cache cleared');
  }

  /**
   * Manual trigger for processing (useful for testing)
   */
  async manualTrigger() {
    if (this.isRunning) {
      throw new Error('Scheduler is already running');
    }

    console.log('🔥 Manual trigger initiated...');
    
    try {
      this.isRunning = true;
      await this.processScheduledPosts();
      return this.getStats();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Health check for accounts - validate all connected accounts
   */
  async performHealthCheck() {
    try {
      console.log('🏥 Starting account health check...');
      
      const connectedAccounts = await Account.find({ connected: true });
      const healthResults = [];
      
      for (const account of connectedAccounts) {
        try {
          const connectionStatus = await this.getCachedConnectionStatus(account);
          
          // Update account health status
          account.connectionHealthy = connectionStatus.connected;
          if (!connectionStatus.connected) {
            account.syncStatus = 'needs_attention';
            account.syncError = connectionStatus.message;
          } else {
            account.syncStatus = 'success';
            account.syncError = null;
          }
          await account.save();
          
          healthResults.push({
            accountId: account._id,
            platform: account.platform,
            username: account.username,
            healthy: connectionStatus.connected,
            message: connectionStatus.message,
            errorCategory: connectionStatus.errorCategory
          });
          
        } catch (error) {
          console.error(`❌ Health check failed for ${account.username}:`, error.message);
          healthResults.push({
            accountId: account._id,
            platform: account.platform,
            username: account.username,
            healthy: false,
            message: error.message,
            errorCategory: 'unknown'
          });
        }
      }
      
      const healthyCount = healthResults.filter(r => r.healthy).length;
      console.log(`🏥 Health check complete: ${healthyCount}/${healthResults.length} accounts healthy`);
      
      return {
        totalAccounts: healthResults.length,
        healthyAccounts: healthyCount,
        unhealthyAccounts: healthResults.length - healthyCount,
        results: healthResults
      };
      
    } catch (error) {
      console.error('❌ Error during health check:', error);
      throw error;
    }
  }

  /**
   * Get detailed publishing report for a specific time period
   */
  async getPublishingReport(hours = 24) {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      const [published, failed, scheduled] = await Promise.all([
        Post.find({
          status: 'published',
          publishedAt: { $gte: since }
        }).populate('accountId', 'platform username'),
        
        Post.find({
          status: 'failed',
          failedAt: { $gte: since }
        }).populate('accountId', 'platform username'),
        
        Post.find({
          status: 'scheduled',
          scheduledDate: { $gte: new Date() }
        }).populate('accountId', 'platform username')
      ]);

      return {
        timeframe: `Last ${hours} hours`,
        summary: {
          published: published.length,
          failed: failed.length,
          scheduled: scheduled.length,
          total: published.length + failed.length + scheduled.length
        },
        published: published.map(post => ({
          id: post._id,
          content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
          platform: post.accountId?.platform,
          username: post.accountId?.username,
          publishedAt: post.publishedAt,
          externalPostId: post.externalPostId
        })),
        failed: failed.map(post => ({
          id: post._id,
          content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
          platform: post.accountId?.platform,
          username: post.accountId?.username,
          failedAt: post.failedAt,
          error: post.publishError
        })),
        upcoming: scheduled.slice(0, 10).map(post => ({
          id: post._id,
          content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
          platform: post.accountId?.platform,
          username: post.accountId?.username,
          scheduledDate: post.scheduledDate
        }))
      };
    } catch (error) {
      console.error('❌ Error generating publishing report:', error);
      throw error;
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
  manualTrigger: () => schedulerService.manualTrigger(),
  performHealthCheck: () => schedulerService.performHealthCheck(),
  clearCache: () => schedulerService.clearCache(),
  getPublishingReport: (hours) => schedulerService.getPublishingReport(hours)
};
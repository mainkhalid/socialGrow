const mongoose = require('mongoose');

const postMediaSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true
  },
  resourceType: {
    type: String,
    enum: ['image', 'video'],
    required: true
  },
  format: {
    type: String,
    required: true
  },
  width: Number,
  height: Number,
  bytes: Number,
  originalName: String,
  // Reference to MediaFile if it exists in our database
  mediaFileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MediaFile'
  }
}, { _id: false });

const postSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true
    },
    platform: {
      type: String,
      enum: ['twitter', 'instagram', 'facebook', 'linkedin'],
      required: true,
      index: true
    },
    content: {
      type: String,
      required: true,
      maxlength: 65000 // Generous limit to support all platforms
    },
    // Media structure with full metadata
    mediaFiles: [postMediaSchema],
    
    scheduledDate: {
      type: Date,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['scheduled', 'published', 'failed', 'cancelled'],
      default: 'scheduled',
      index: true
    },
    // Enhanced analytics structure
    analytics: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      retweets: { type: Number, default: 0 }, // Twitter specific
      impressions: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
      engagementRate: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      // Platform-specific metrics
      platformMetrics: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      },
      lastUpdated: Date
    },
    externalPostId: {
      type: String,
      index: { sparse: true }
    },
    publishedAt: {
      type: Date,
      index: { sparse: true }
    },
    // Enhanced error handling
    publishError: {
      type: String,
      maxlength: 1000
    },
    errorCode: {
      type: String,
      enum: [
        'RATE_LIMIT',
        'TOKEN_EXPIRED', 
        'NETWORK_ERROR',
        'DUPLICATE_CONTENT',
        'CONTENT_POLICY',
        'CONNECTION_ERROR',
        'MEDIA_ERROR',
        'UNKNOWN'
      ]
    },
    retryCount: {
      type: Number,
      default: 0,
      max: 3
    },
    lastRetryAt: Date,
    
    // Scheduling metadata
    timezone: {
      type: String,
      default: 'UTC'
    },
    originalScheduledDate: Date, // Store original date in case of rescheduling
    
    // Content metadata
    hashtags: [String],
    mentions: [String],
    links: [String],
    
    // Performance tracking
    processingTime: Number, // Time taken to publish in milliseconds
    publishAttempts: [{
      attemptedAt: { type: Date, default: Date.now },
      success: Boolean,
      error: String,
      responseTime: Number
    }]
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
postSchema.index({ userId: 1, status: 1 });
postSchema.index({ userId: 1, platform: 1, status: 1 });
postSchema.index({ userId: 1, scheduledDate: 1 });
postSchema.index({ status: 1, scheduledDate: 1 }); // For scheduler queries
postSchema.index({ accountId: 1, status: 1 });
postSchema.index({ externalPostId: 1 }, { sparse: true });

// Virtual for determining if post is overdue
postSchema.virtual('isOverdue').get(function() {
  return this.status === 'scheduled' && this.scheduledDate < new Date();
});

// Virtual for time until/since scheduled
postSchema.virtual('timeToScheduled').get(function() {
  const now = new Date();
  const scheduled = new Date(this.scheduledDate);
  return scheduled.getTime() - now.getTime(); // Positive if future, negative if past
});

// Virtual for engagement rate calculation
postSchema.virtual('calculatedEngagementRate').get(function() {
  if (!this.analytics.impressions || this.analytics.impressions === 0) return 0;
  const engagements = (this.analytics.likes || 0) + 
                     (this.analytics.comments || 0) + 
                     (this.analytics.shares || 0) + 
                     (this.analytics.retweets || 0);
  return ((engagements / this.analytics.impressions) * 100).toFixed(2);
});

// Virtual to get media URLs (for backward compatibility)
postSchema.virtual('mediaUrls').get(function() {
  return this.mediaFiles?.map(file => file.url) || [];
});

// Method to extract content metadata
postSchema.methods.extractContentMetadata = function() {
  const content = this.content;
  
  // Extract hashtags
  this.hashtags = [...new Set((content.match(/#[\w]+/g) || []).map(tag => tag.toLowerCase()))];
  
  // Extract mentions
  this.mentions = [...new Set((content.match(/@[\w]+/g) || []).map(mention => mention.toLowerCase()))];
  
  // Extract links
  this.links = [...new Set(content.match(/https?:\/\/[^\s]+/g) || [])];
  
  return this;
};

// Method to add publish attempt
postSchema.methods.addPublishAttempt = function(success, error = null, responseTime = null) {
  if (!this.publishAttempts) this.publishAttempts = [];
  
  this.publishAttempts.push({
    attemptedAt: new Date(),
    success,
    error,
    responseTime
  });
  
  // Keep only last 10 attempts
  if (this.publishAttempts.length > 10) {
    this.publishAttempts = this.publishAttempts.slice(-10);
  }
  
  return this;
};

// Method to update analytics
postSchema.methods.updateAnalytics = function(newAnalytics) {
  if (!this.analytics) this.analytics = {};
  
  Object.assign(this.analytics, newAnalytics);
  this.analytics.lastUpdated = new Date();
  
  return this;
};

// Method to check if post can be retried
postSchema.methods.canRetry = function() {
  return this.status === 'failed' && 
         this.retryCount < 3 && 
         (!this.lastRetryAt || 
          (new Date() - this.lastRetryAt) > 5 * 60 * 1000); // 5 minutes between retries
};

// Method to prepare for retry
postSchema.methods.prepareForRetry = function() {
  this.status = 'scheduled';
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  this.publishError = null;
  this.errorCode = null;
  return this;
};

// Method to mark as published
postSchema.methods.markAsPublished = function(externalPostId, publishedAt = new Date()) {
  this.status = 'published';
  this.externalPostId = externalPostId;
  this.publishedAt = publishedAt;
  this.publishError = null;
  this.errorCode = null;
  return this;
};

// Method to mark as failed
postSchema.methods.markAsFailed = function(error, errorCode = 'UNKNOWN') {
  this.status = 'failed';
  this.publishError = error;
  this.errorCode = errorCode;
  return this;
};

// Static method to get posts ready for publishing
postSchema.statics.getPostsReadyForPublishing = function(limit = 50) {
  return this.find({
    status: 'scheduled',
    scheduledDate: { $lte: new Date() }
  })
  .populate('accountId', 'platform username connected apiKey apiSecret accessToken accessTokenSecret')
  .sort({ scheduledDate: 1 })
  .limit(limit);
};

// Static method to get user's post statistics
postSchema.statics.getUserStats = function(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        platforms: { $addToSet: '$platform' }
      }
    }
  ]);
};

// Pre-save middleware to extract metadata
postSchema.pre('save', function(next) {
  if (this.isModified('content')) {
    this.extractContentMetadata();
  }
  
  // Set original scheduled date if not set
  if (this.isNew && !this.originalScheduledDate) {
    this.originalScheduledDate = this.scheduledDate;
  }
  
  next();
});

// Post-save middleware to update media file usage
postSchema.post('save', async function(doc, next) {
  if (doc.mediaFiles && doc.mediaFiles.length > 0) {
    try {
      const MediaFile = require('./mediaFile.model');
      
      // Update usage count for referenced media files
      for (const media of doc.mediaFiles) {
        if (media.mediaFileId) {
          await MediaFile.findByIdAndUpdate(
            media.mediaFileId,
            { 
              $inc: { usageCount: 1 },
              $set: { lastUsedAt: new Date() }
            }
          );
        }
      }
    } catch (error) {
      console.error('Error updating media file usage:', error);
    }
  }
  next();
});

const Post = mongoose.model('Post', postSchema);
module.exports = Post;
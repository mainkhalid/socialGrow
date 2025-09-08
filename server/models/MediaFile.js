const mongoose = require('mongoose');

const mediaFileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  originalName: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true // Size in bytes
  },
  cloudinaryUrl: {
    type: String,
    required: true,
    unique: true
  },
  cloudinaryPublicId: {
    type: String,
    required: true,
    unique: true
  },
  resourceType: {
    type: String,
    enum: ['image', 'video'],
    required: true
  },
  format: {
    type: String,
    required: true // e.g., 'jpg', 'mp4', etc.
  },
  width: {
    type: Number
  },
  height: {
    type: Number
  },
  duration: {
    type: Number // For videos, duration in seconds
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  description: {
    type: String,
    maxlength: 500
  },
  // Track usage in posts
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsedAt: {
    type: Date
  },
  // Metadata for different social platforms
  platformMetadata: {
    twitter: {
      suitable: { type: Boolean, default: true },
      reason: String
    },
    instagram: {
      suitable: { type: Boolean, default: true },
      reason: String
    },
    facebook: {
      suitable: { type: Boolean, default: true },
      reason: String
    },
    linkedin: {
      suitable: { type: Boolean, default: true },
      reason: String
    }
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
mediaFileSchema.index({ userId: 1, resourceType: 1 });
mediaFileSchema.index({ userId: 1, uploadedAt: -1 });
mediaFileSchema.index({ cloudinaryPublicId: 1 });

// Virtual for formatted file size
mediaFileSchema.virtual('formattedSize').get(function() {
  const bytes = this.size;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Method to check platform suitability
mediaFileSchema.methods.checkPlatformSuitability = function() {
  const suitability = {
    twitter: { suitable: true, reason: null },
    instagram: { suitable: true, reason: null },
    facebook: { suitable: true, reason: null },
    linkedin: { suitable: true, reason: null }
  };

  // Twitter specific checks
  if (this.resourceType === 'video') {
    if (this.size > 512 * 1024 * 1024) { // 512MB
      suitability.twitter = { suitable: false, reason: 'Video exceeds 512MB limit for Twitter' };
    }
    if (this.duration > 140) { // 140 seconds
      suitability.twitter = { suitable: false, reason: 'Video exceeds 140 second limit for Twitter' };
    }
  } else if (this.resourceType === 'image') {
    if (this.size > 5 * 1024 * 1024) { // 5MB
      suitability.twitter = { suitable: false, reason: 'Image exceeds 5MB limit for Twitter' };
    }
  }

  // Instagram specific checks
  if (this.resourceType === 'video') {
    if (this.size > 100 * 1024 * 1024) { // 100MB
      suitability.instagram = { suitable: false, reason: 'Video exceeds 100MB limit for Instagram' };
    }
    if (this.duration > 60) { // 60 seconds for feed posts
      suitability.instagram = { suitable: false, reason: 'Video exceeds 60 second limit for Instagram feed' };
    }
  } else if (this.resourceType === 'image') {
    if (this.size > 30 * 1024 * 1024) { // 30MB
      suitability.instagram = { suitable: false, reason: 'Image exceeds 30MB limit for Instagram' };
    }
  }

  // Facebook specific checks
  if (this.resourceType === 'video') {
    if (this.size > 1024 * 1024 * 1024) { // 1GB
      suitability.facebook = { suitable: false, reason: 'Video exceeds 1GB limit for Facebook' };
    }
  } else if (this.resourceType === 'image') {
    if (this.size > 10 * 1024 * 1024) { // 10MB
      suitability.facebook = { suitable: false, reason: 'Image exceeds 10MB limit for Facebook' };
    }
  }

  // LinkedIn specific checks
  if (this.resourceType === 'video') {
    if (this.size > 200 * 1024 * 1024) { // 200MB
      suitability.linkedin = { suitable: false, reason: 'Video exceeds 200MB limit for LinkedIn' };
    }
    if (this.duration > 600) { // 10 minutes
      suitability.linkedin = { suitable: false, reason: 'Video exceeds 10 minute limit for LinkedIn' };
    }
  } else if (this.resourceType === 'image') {
    if (this.size > 20 * 1024 * 1024) { // 20MB
      suitability.linkedin = { suitable: false, reason: 'Image exceeds 20MB limit for LinkedIn' };
    }
  }

  // Update the document
  this.platformMetadata = suitability;
  return suitability;
};

// Method to increment usage count
mediaFileSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  return this.save();
};

// Static method to get user's media usage
mediaFileSchema.statics.getUserUsage = async function(userId) {
  const result = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$resourceType',
        count: { $sum: 1 },
        totalSize: { $sum: '$size' }
      }
    }
  ]);

  const usage = {
    images: { count: 0, size: 0 },
    videos: { count: 0, size: 0 },
    total: { count: 0, size: 0 }
  };

  result.forEach(item => {
    usage[item._id + 's'] = { count: item.count, size: item.totalSize };
    usage.total.count += item.count;
    usage.total.size += item.totalSize;
  });

  return usage;
};

// Static method to clean up orphaned files
mediaFileSchema.statics.findOrphanedFiles = async function(userId) {
  const Post = require('./post.model');
  
  // Get all media files for user
  const mediaFiles = await this.find({ userId });
  
  // Get all media URLs referenced in posts
  const posts = await Post.find({ userId }, 'mediaFiles mediaUrls');
  const referencedUrls = new Set();
  
  posts.forEach(post => {
    if (post.mediaFiles && Array.isArray(post.mediaFiles)) {
      post.mediaFiles.forEach(media => {
        if (media.url) referencedUrls.add(media.url);
      });
    }
    // Legacy support
    if (post.mediaUrls && Array.isArray(post.mediaUrls)) {
      post.mediaUrls.forEach(url => referencedUrls.add(url));
    }
  });
  
  // Return files not referenced in any posts
  return mediaFiles.filter(file => !referencedUrls.has(file.cloudinaryUrl));
};

// Pre-save middleware to check platform suitability
mediaFileSchema.pre('save', function(next) {
  if (this.isNew || this.isModified(['size', 'duration', 'resourceType'])) {
    this.checkPlatformSuitability();
  }
  next();
});

// Pre-remove middleware to clean up Cloudinary
mediaFileSchema.pre('remove', async function(next) {
  try {
    const cloudinary = require('cloudinary').v2;
    await cloudinary.uploader.destroy(this.cloudinaryPublicId, {
      resource_type: this.resourceType
    });
  } catch (error) {
    console.error('Failed to delete from Cloudinary:', error);
    // Don't fail the deletion if Cloudinary cleanup fails
  }
  next();
});

const MediaFile = mongoose.model('MediaFile', mediaFileSchema);
module.exports = MediaFile;
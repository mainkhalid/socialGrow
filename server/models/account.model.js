const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['twitter', 'facebook', 'instagram']
  },
  username: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  profileImageUrl: {
    type: String,
    default: ''
  },
  verified: {
    type: Boolean,
    default: false
  },
  // Twitter requires all 4 credentials
  apiKey: {
    type: String,
    required: function() {
      return this.platform === 'twitter';
    }
  },
  apiSecret: {
    type: String,
    required: function() {
      return this.platform === 'twitter';
    }
  },
  accessToken: {
    type: String,
    required: true // Required for all platforms
  },
  accessTokenSecret: {
    type: String,
    required: function() {
      return this.platform === 'twitter';
    }
  },
  // Facebook/Instagram Graph API credentials (shared)
  facebookAppId: {
    type: String,
    required: function() {
      return ['facebook', 'instagram'].includes(this.platform);
    }
  },
  facebookAppSecret: {
    type: String,
    required: function() {
      return ['facebook', 'instagram'].includes(this.platform);
    }
  },
  // Token expiry for Facebook/Instagram
  tokenExpiresAt: {
    type: Date,
    default: null
  },
  connected: {
    type: Boolean,
    default: false
  },
  dateConnected: {
    type: Date,
    default: Date.now
  },
  // Profile data from API responses
  profileData: {
    id: String,
    username: String,
    displayName: String,
    description: String,
    location: String,
    profileImageUrl: String,
    verified: Boolean,
    createdAt: Date,
    followers: Number,
    following: Number,
    posts: Number,
    engagement: Number,
    // Facebook/Instagram specific
    name: String,
    biography: String,
    website: String,
    pageUrl: String,
    instagramBusinessAccount: String // For Facebook pages with Instagram business account
  },
  stats: {
    followers: {
      type: Number,
      default: 0
    },
    following: {
      type: Number,
      default: 0
    },
    posts: {
      type: Number,
      default: 0
    },
    engagement: {
      type: Number,
      default: 0
    },
    impressions: {
      type: Number,
      default: 0
    },
    reach: {
      type: Number,
      default: 0
    }
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },
  syncStatus: {
    type: String,
    enum: ['success', 'failed', 'pending', 'disconnected'],
    default: 'pending'
  },
  syncError: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Optimized indexes for the three platforms
accountSchema.index({ userId: 1, platform: 1, username: 1 });
accountSchema.index({ userId: 1, connected: 1 });
accountSchema.index({ platform: 1, connected: 1 });
accountSchema.index({ lastSyncedAt: 1 });
accountSchema.index({ tokenExpiresAt: 1 });

// Virtual for profile URL
accountSchema.virtual('profileUrl').get(function() {
  const baseUrls = {
    twitter: 'https://twitter.com/',
    facebook: 'https://facebook.com/',
    instagram: 'https://instagram.com/'
  };
  
  // Handle Facebook page URLs
  if (this.platform === 'facebook' && this.profileData?.pageUrl) {
    return this.profileData.pageUrl;
  }
  
  return baseUrls[this.platform] + this.username;
});

// Method to check if account needs sync (optimized intervals)
accountSchema.methods.needsSync = function() {
  const now = new Date();
  const lastSync = this.lastSyncedAt || new Date(0);
  const hoursSinceSync = (now - lastSync) / (1000 * 60 * 60);
  
  // Sync intervals optimized for API rate limits
  const syncIntervals = {
    twitter: 1,     // 1 hour (Twitter API v2 has good rate limits)
    facebook: 2,    // 2 hours (Graph API rate limits)
    instagram: 2    // 2 hours (Uses Facebook Graph API)
  };
  
  return hoursSinceSync > syncIntervals[this.platform];
};

// Method to check if token is expired
accountSchema.methods.isTokenExpired = function() {
  if (!this.tokenExpiresAt) return false;
  return new Date() > this.tokenExpiresAt;
};

// Method to get connection health
accountSchema.methods.getConnectionHealth = function() {
  const issues = [];
  
  if (!this.connected) {
    issues.push('Account not connected');
  }
  
  if (this.isTokenExpired()) {
    issues.push('Access token expired');
  }
  
  if (this.syncStatus === 'failed') {
    issues.push(`Last sync failed: ${this.syncError}`);
  }
  
  if (this.syncStatus === 'disconnected') {
    issues.push('Account manually disconnected');
  }
  
  // Check for missing required credentials
  const missingCredentials = this.getMissingCredentials();
  if (missingCredentials.length > 0) {
    issues.push(`Missing credentials: ${missingCredentials.join(', ')}`);
  }
  
  if (this.needsSync() && this.connected) {
    issues.push('Needs sync');
  }
  
  return {
    healthy: issues.length === 0,
    issues: issues
  };
};

// Method to get missing credentials based on platform
accountSchema.methods.getMissingCredentials = function() {
  const missing = [];
  
  switch (this.platform) {
    case 'twitter':
      if (!this.apiKey) missing.push('API Key');
      if (!this.apiSecret) missing.push('API Secret');
      if (!this.accessToken) missing.push('Access Token');
      if (!this.accessTokenSecret) missing.push('Access Token Secret');
      break;
      
    case 'facebook':
    case 'instagram':
      if (!this.facebookAppId) missing.push('Facebook App ID');
      if (!this.facebookAppSecret) missing.push('Facebook App Secret');
      if (!this.accessToken) missing.push('Access Token');
      break;
  }
  
  return missing;
};

// Method to validate required credentials
accountSchema.methods.hasRequiredCredentials = function() {
  return this.getMissingCredentials().length === 0;
};

// Method to get sync status
accountSchema.methods.getSyncStatus = function() {
  return {
    status: this.syncStatus,
    lastSyncedAt: this.lastSyncedAt,
    needsSync: this.needsSync(),
    tokenExpired: this.isTokenExpired(),
    error: this.syncError
  };
};

// Pre-save middleware to update sync status and profile data
accountSchema.pre('save', function(next) {
  // Update sync info when stats or profile data changes
  if (this.isModified('stats') || this.isModified('profileData')) {
    this.lastSyncedAt = new Date();
    if (this.syncStatus !== 'failed' && this.syncStatus !== 'disconnected') {
      this.syncStatus = 'success';
      this.syncError = '';
    }
  }
  
  // Keep profile data in sync with main fields
  if (this.isModified('username') || this.isModified('displayName') || 
      this.isModified('description') || this.isModified('location') || 
      this.isModified('profileImageUrl') || this.isModified('verified')) {
    
    this.profileData = this.profileData || {};
    this.profileData.username = this.username;
    this.profileData.displayName = this.displayName;
    this.profileData.description = this.description;
    this.profileData.location = this.location;
    this.profileData.profileImageUrl = this.profileImageUrl;
    this.profileData.verified = this.verified;
  }
  
  // For Facebook/Instagram, store Facebook credentials in the legacy fields for backward compatibility
  if (['facebook', 'instagram'].includes(this.platform)) {
    if (this.facebookAppId && !this.apiKey) {
      this.apiKey = this.facebookAppId;
    }
    if (this.facebookAppSecret && !this.apiSecret) {
      this.apiSecret = this.facebookAppSecret;
    }
  }
  
  next();
});

// Method to refresh profile data from API
accountSchema.methods.refreshProfile = async function() {
  try {
    const { syncSocialMediaStats } = require('../services/social-media.service');
    
    const credentials = this.getApiCredentials();
    const profileData = await syncSocialMediaStats(
      this.platform,
      credentials.apiKey,
      credentials.apiSecret,
      credentials.accessToken,
      credentials.accessTokenSecret
    );
    
    // Update account fields
    if (profileData.username) this.username = profileData.username;
    if (profileData.displayName) this.displayName = profileData.displayName;
    if (profileData.description !== undefined) this.description = profileData.description;
    if (profileData.location !== undefined) this.location = profileData.location;
    if (profileData.profileImageUrl) this.profileImageUrl = profileData.profileImageUrl;
    if (profileData.verified !== undefined) this.verified = profileData.verified;
    
    // Update stats
    this.stats = {
      followers: profileData.followers || 0,
      following: profileData.following || 0,
      posts: profileData.posts || 0,
      engagement: profileData.engagement || 0,
      impressions: this.stats.impressions || 0,
      reach: this.stats.reach || 0
    };
    
    // Update detailed profile data
    this.profileData = {
      id: profileData.id,
      username: this.username,
      displayName: this.displayName,
      description: this.description,
      location: this.location,
      profileImageUrl: this.profileImageUrl,
      verified: this.verified,
      createdAt: profileData.createdAt,
      followers: profileData.followers,
      following: profileData.following,
      posts: profileData.posts,
      engagement: profileData.engagement,
      // Platform-specific data
      name: profileData.name,
      biography: profileData.biography || profileData.description,
      website: profileData.website,
      pageUrl: profileData.pageUrl,
      instagramBusinessAccount: profileData.instagramBusinessAccount
    };
    
    this.connected = true;
    this.lastSyncedAt = new Date();
    this.syncStatus = 'success';
    this.syncError = '';
    
    await this.save();
    return this;
  } catch (error) {
    this.connected = false;
    this.syncStatus = 'failed';
    this.syncError = error.message;
    await this.save();
    throw error;
  }
};

// Helper method to get API credentials in the format expected by services
accountSchema.methods.getApiCredentials = function() {
  if (this.platform === 'twitter') {
    return {
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      accessToken: this.accessToken,
      accessTokenSecret: this.accessTokenSecret
    };
  } else {
    // Facebook/Instagram
    return {
      apiKey: this.facebookAppId || this.apiKey,
      apiSecret: this.facebookAppSecret || this.apiSecret,
      accessToken: this.accessToken,
      accessTokenSecret: null
    };
  }
};

module.exports = mongoose.model('Account', accountSchema);
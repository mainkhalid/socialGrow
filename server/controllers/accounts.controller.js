const Account = require('../models/account.model');
const { 
  syncSocialMediaStats, 
  validateSocialMediaCredentials 
} = require('../services/social-media.service');
const { autoManageScheduler } = require('../services/scheduler.service');

// Connect a new social media account
const connectAccount = async (req, res) => {
  try {
    const { 
      platform, 
      apiKey, 
      apiSecret, 
      accessToken, 
      accessTokenSecret,
      facebookAppId,
      facebookAppSecret
    } = req.body;

    // Validate required fields
    if (!platform || !accessToken) {
      return res.status(400).json({ 
        message: 'Platform and access token are required' 
      });
    }

    const platformLower = platform.toLowerCase();
    
    // Validate platform is supported
    if (!['twitter', 'facebook', 'instagram'].includes(platformLower)) {
      return res.status(400).json({ 
        message: 'Platform must be twitter, facebook, or instagram' 
      });
    }

    // Validate platform-specific requirements
    if (platformLower === 'twitter' && (!apiKey || !apiSecret || !accessTokenSecret)) {
      return res.status(400).json({ 
        message: 'Twitter requires API key, API secret, access token, and access token secret' 
      });
    }

    if (['facebook', 'instagram'].includes(platformLower)) {
      const appId = facebookAppId || apiKey;
      const appSecret = facebookAppSecret || apiSecret;
      
      if (!appId || !appSecret) {
        return res.status(400).json({ 
          message: `${platform} requires Facebook App ID, App Secret, and Access Token` 
        });
      }
    }

    // Prepare credentials for validation
    let validationCredentials;
    if (platformLower === 'twitter') {
      validationCredentials = {
        apiKey,
        apiSecret,
        accessToken,
        accessTokenSecret
      };
    } else {
      // Facebook/Instagram - use Graph API credentials
      validationCredentials = {
        apiKey: facebookAppId || apiKey,
        apiSecret: facebookAppSecret || apiSecret,
        accessToken,
        accessTokenSecret: null
      };
    }

    // Validate credentials with the actual platform API
    try {
      await validateSocialMediaCredentials(
        platformLower, 
        validationCredentials.apiKey,
        validationCredentials.apiSecret,
        validationCredentials.accessToken,
        validationCredentials.accessTokenSecret
      );
    } catch (error) {
      return res.status(400).json({ 
        message: 'Invalid credentials. Please check your API keys and tokens.',
        error: error.message 
      });
    }

    // Sync account stats to get profile information
    const accountStats = await syncSocialMediaStats(
      platformLower,
      validationCredentials.apiKey,
      validationCredentials.apiSecret,
      validationCredentials.accessToken,
      validationCredentials.accessTokenSecret
    );

    // Get username - priority: API response > existing data
    const accountUsername = accountStats.username || accountStats.displayName || 'Unknown';

    // Check if account already exists (by platform and username or profile ID)
    const existingAccount = await Account.findOne({
      userId: req.user.userId,
      platform: platformLower,
      $or: [
        { username: accountUsername },
        { 'profileData.id': accountStats.id }
      ]
    });

    const accountData = {
      userId: req.user.userId,
      platform: platformLower,
      username: accountUsername,
      displayName: accountStats.displayName || accountStats.name || accountUsername,
      description: accountStats.description || accountStats.biography || '',
      location: accountStats.location || '',
      profileImageUrl: accountStats.profileImageUrl || '',
      verified: accountStats.verified || false,
      connected: true,
      accessToken,
      stats: {
        followers: accountStats.followers || 0,
        following: accountStats.following || 0,
        posts: accountStats.posts || 0,
        engagement: accountStats.engagement || 0,
        impressions: accountStats.impressions || 0,
        reach: accountStats.reach || 0
      },
      profileData: {
        id: accountStats.id,
        username: accountUsername,
        displayName: accountStats.displayName || accountStats.name,
        description: accountStats.description || accountStats.biography,
        location: accountStats.location,
        profileImageUrl: accountStats.profileImageUrl,
        verified: accountStats.verified,
        createdAt: accountStats.createdAt,
        followers: accountStats.followers,
        following: accountStats.following,
        posts: accountStats.posts,
        engagement: accountStats.engagement,
        // Platform-specific data
        name: accountStats.name,
        biography: accountStats.biography,
        website: accountStats.website,
        pageUrl: accountStats.pageUrl,
        instagramBusinessAccount: accountStats.instagramBusinessAccount
      },
      syncStatus: 'success',
      syncError: '',
      lastSyncedAt: new Date()
    };

    // Add platform-specific credentials
    if (platformLower === 'twitter') {
      accountData.apiKey = apiKey;
      accountData.apiSecret = apiSecret;
      accountData.accessTokenSecret = accessTokenSecret;
    } else {
      // Facebook/Instagram
      accountData.facebookAppId = facebookAppId || apiKey;
      accountData.facebookAppSecret = facebookAppSecret || apiSecret;
      accountData.apiKey = facebookAppId || apiKey; // Backward compatibility
      accountData.apiSecret = facebookAppSecret || apiSecret; // Backward compatibility
      
      // Set token expiry if provided
      if (accountStats.tokenExpiresAt) {
        accountData.tokenExpiresAt = new Date(accountStats.tokenExpiresAt);
      }
    }

    let savedAccount;
    if (existingAccount) {
      // Update existing account
      Object.assign(existingAccount, accountData);
      savedAccount = await existingAccount.save();
      
      res.json({
        message: 'Account reconnected successfully',
        account: sanitizeAccountResponse(savedAccount)
      });
    } else {
      // Create new account
      const newAccount = new Account(accountData);
      savedAccount = await newAccount.save();
      
      res.status(201).json({
        message: 'Account connected successfully',
        account: sanitizeAccountResponse(savedAccount)
      });
    }

    // Auto-manage scheduler after connection
    await autoManageScheduler();
    
  } catch (error) {
    console.error('Connect account error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Disconnect a social media account
const disconnectAccount = async (req, res) => {
  try {
    const { accountId } = req.params;

    const account = await Account.findOne({
      _id: accountId,
      userId: req.user.userId
    });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Mark account as disconnected but keep the record
    account.connected = false;
    account.syncStatus = 'disconnected';
    account.syncError = 'Manually disconnected by user';
    
    await account.save();

    // Auto-manage scheduler after disconnection
    await autoManageScheduler();

    res.json({ message: 'Account disconnected successfully' });
  } catch (error) {
    console.error('Disconnect account error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all connected accounts for the user
const getAccounts = async (req, res) => {
  try {
    const accounts = await Account.find({ userId: req.user.userId })
      .sort({ createdAt: -1 });

    // Add health info and sanitize response
    const accountsWithHealth = accounts.map(account => ({
      ...sanitizeAccountResponse(account),
      connectionHealth: account.getConnectionHealth(),
      syncStatus: account.getSyncStatus(),
      profileUrl: account.profileUrl
    }));

    res.json(accountsWithHealth);
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Sync account stats manually
const syncAccount = async (req, res) => {
  try {
    const { accountId } = req.params;

    const account = await Account.findOne({
      _id: accountId,
      userId: req.user.userId
    });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    if (!account.connected) {
      return res.status(400).json({ message: 'Account is not connected' });
    }

    try {
      const credentials = account.getApiCredentials();
      const updatedStats = await syncSocialMediaStats(
        account.platform,
        credentials.apiKey,
        credentials.apiSecret,
        credentials.accessToken,
        credentials.accessTokenSecret
      );

      // Update account with new data
      account.stats = {
        followers: updatedStats.followers || 0,
        following: updatedStats.following || 0,
        posts: updatedStats.posts || 0,
        engagement: updatedStats.engagement || 0,
        impressions: updatedStats.impressions || 0,
        reach: updatedStats.reach || 0
      };

      // Update profile data if available
      if (updatedStats.username) account.username = updatedStats.username;
      if (updatedStats.displayName) account.displayName = updatedStats.displayName;
      if (updatedStats.description !== undefined) account.description = updatedStats.description;
      if (updatedStats.location !== undefined) account.location = updatedStats.location;
      if (updatedStats.profileImageUrl) account.profileImageUrl = updatedStats.profileImageUrl;
      if (updatedStats.verified !== undefined) account.verified = updatedStats.verified;

      account.syncStatus = 'success';
      account.syncError = '';
      account.lastSyncedAt = new Date();
      
      await account.save();

      res.json({
        message: 'Account synced successfully',
        account: sanitizeAccountResponse(account)
      });
    } catch (error) {
      account.syncStatus = 'failed';
      account.syncError = error.message;
      account.lastSyncedAt = new Date();
      
      await account.save();

      res.status(400).json({ 
        message: 'Failed to sync account',
        error: error.message 
      });
    }
  } catch (error) {
    console.error('Sync account error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete an account
const deleteAccount = async (req, res) => {
  try {
    const { accountId } = req.params;

    const account = await Account.findOne({
      _id: accountId,
      userId: req.user.userId
    });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    await Account.deleteOne({ _id: accountId });

    // Auto-manage scheduler after deletion
    await autoManageScheduler();

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Helper function to remove sensitive data from account responses
function sanitizeAccountResponse(account) {
  const accountObj = account.toObject();
  delete accountObj.apiKey;
  delete accountObj.apiSecret;
  delete accountObj.accessToken;
  delete accountObj.accessTokenSecret;
  delete accountObj.facebookAppId;
  delete accountObj.facebookAppSecret;
  return accountObj;
}

module.exports = {
  connectAccount,
  disconnectAccount,
  getAccounts,
  syncAccount,
  deleteAccount
};
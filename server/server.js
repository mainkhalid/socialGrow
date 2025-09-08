const dotenv = require('dotenv');
dotenv.config();


const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth.routes');
const accountsRoutes = require('./routes/accounts.routes');
const schedulerRoutes = require('./routes/scheduler.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const ideasRoutes = require('./routes/ideas.routes');
const { authenticateToken } = require('./middleware/auth.middleware');
const { initScheduler } = require('./services/scheduler.service');
const { getConnectionStatus, validateSocialMediaCredentials } = require('./services/social-media.service');
const Account = require('./models/account.model');
const mediaRoutes = require('./routes/media.routes');


const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173', 
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Connect to MongoDB with better error handling
async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    console.log('Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    return false;
  }
}

// Enhanced account validation functions
function validateAccountCredentials(account) {
  const platform = account.platform.toLowerCase();
  
  switch (platform) {
    case 'twitter':
      return !!(account.apiKey && account.apiSecret && account.accessToken && account.accessTokenSecret);
    case 'instagram':
    case 'facebook':
      return !!(account.accessToken && (account.apiKey || account.facebookAppId));
    default:
      return false;
  }
}

function getMissingCredentials(account) {
  const platform = account.platform.toLowerCase();
  const missing = [];
  
  switch (platform) {
    case 'twitter':
      if (!account.apiKey) missing.push('API Key');
      if (!account.apiSecret) missing.push('API Secret');
      if (!account.accessToken) missing.push('Access Token');
      if (!account.accessTokenSecret) missing.push('Access Token Secret');
      break;
    case 'instagram':
    case 'facebook':
      if (!account.accessToken) missing.push('Access Token');
      if (!account.apiKey && !account.facebookAppId) missing.push('App ID');
      if (!account.apiSecret && !account.facebookAppSecret) missing.push('App Secret');
      break;
  }
  
  return missing;
}

///scheduler initialization 
async function initializeScheduler() {
  console.log('\n Initializing Social Media Scheduler...');
  
  try {
    const { initScheduler, autoManageScheduler } = require('./services/scheduler.service');
    const Account = require('./models/account.model');
    
    // First initialize the scheduler service
    await initScheduler();
    
    // Then auto-manage based on account status
    await autoManageScheduler();

    // Fetch connected accounts
    const accounts = await Account.find({ connected: true }).lean();

    console.log('\n🔗 Connected Accounts:');
    if (accounts.length > 0) {
      accounts.forEach(acc => {
        console.log(`• [${acc.platform.toUpperCase()}] ${acc.username || acc.pageName || 'N/A'} (ID: ${acc._id})`);
      });
    } else {
      console.log(' No accounts connected yet');
    }

    console.log('\n Scheduler initialization complete!');
    
  } catch (error) {
    console.error('\n Scheduler initialization error:', error.message);
    console.log('⏸Scheduler not initialized due to error');
  }
 
const accounts = await Account.find({});
for (const account of accounts) {
  const hasRequiredCredentials = validateAccountCredentials(account);
  if (hasRequiredCredentials) {
    try {
      const connectionStatus = await getConnectionStatus(
        account.platform,
        account.apiKey || account.facebookAppId,
        account.apiSecret || account.facebookAppSecret,
        account.accessToken,
        account.accessTokenSecret
      );
      account.connected = connectionStatus.connected;
      account.syncStatus = connectionStatus.connected ? 'success' : 'failed';
      account.syncError = connectionStatus.connected ? '' : connectionStatus.message;
      account.lastSyncedAt = new Date();
      await account.save();
    } catch (err) {
      account.connected = false;
      account.syncStatus = 'error';
      account.syncError = err.message;
      await account.save();
    }
  }
}

}


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', authenticateToken, accountsRoutes);
app.use('/api/scheduler', authenticateToken, schedulerRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/ideas', authenticateToken, ideasRoutes);
app.use('/api/media', authenticateToken, mediaRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// System status endpoint
app.get('/api/status', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const totalAccounts = await Account.countDocuments();
    const connectedAccounts = await Account.countDocuments({ connected: true });
    
    res.json({
      database: dbStatus,
      accounts: {
        total: totalAccounts,
        connected: connectedAccounts,
        disconnected: totalAccounts - connectedAccounts
      },
      server: {
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Unable to fetch system status',
      message: error.message 
    });
  }
});

// Enhanced debug endpoint
app.get('/api/debug/accounts', authenticateToken, async (req, res) => {
  try {
    const accounts = await Account.find({ userId: req.user.userId }).select('-__v');
    
    const accountDetails = accounts.map(account => {
      const hasRequiredCredentials = validateAccountCredentials(account);
      const missingCredentials = getMissingCredentials(account);
      
      return {
        id: account._id,
        platform: account.platform,
        username: account.username,
        displayName: account.displayName,
        connected: account.connected,
        syncStatus: account.syncStatus,
        syncError: account.syncError,
        lastSyncedAt: account.lastSyncedAt,
        createdAt: account.createdAt,
        hasRequiredCredentials,
        missingCredentials: hasRequiredCredentials ? [] : missingCredentials,
        stats: account.stats,
        connectionHealth: account.getConnectionHealth?.() || 'unknown'
      };
    });
    
    res.json({
      userId: req.user.userId,
      summary: {
        totalAccounts: accounts.length,
        connectedAccounts: accounts.filter(acc => acc.connected).length,
        disconnectedAccounts: accounts.filter(acc => !acc.connected).length
      },
      accounts: accountDetails
    });
  } catch (error) {
    console.error('Debug accounts error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
});

app.post('/api/debug/test-connections', authenticateToken, async (req, res) => {
  try {
    const accounts = await Account.find({ userId: req.user.userId });
    const connectionResults = [];
    
    console.log(`🔍 Testing connections for ${accounts.length} account(s)...`);
    
    for (const account of accounts) {
      const hasRequiredCredentials = validateAccountCredentials(account);
      
      if (!hasRequiredCredentials) {
        const missingCreds = getMissingCredentials(account);
        connectionResults.push({
          accountId: account._id,
          platform: account.platform,
          username: account.username,
          status: 'missing_credentials',
          message: `Missing credentials: ${missingCreds.join(', ')}`,
          connected: false,
          details: { missingCredentials: missingCreds }
        });
        continue;
      }
      
      try {
        console.log(`   Testing ${account.platform} (@${account.username})...`);
        
        const connectionStatus = await getConnectionStatus(
          account.platform,
          account.apiKey || account.facebookAppId,
          account.apiSecret || account.facebookAppSecret,
          account.accessToken,
          account.accessTokenSecret
        );
        
        connectionResults.push({
          accountId: account._id,
          platform: account.platform,
          username: account.username,
          status: connectionStatus.connected ? 'connected' : 'failed',
          message: connectionStatus.message || 'Connection successful',
          connected: connectionStatus.connected,
          lastChecked: connectionStatus.lastChecked,
          details: connectionStatus
        });
        
        // Update connection status in database
        account.connected = connectionStatus.connected;
        account.syncStatus = connectionStatus.connected ? 'success' : 'failed';
        account.syncError = connectionStatus.connected ? '' : connectionStatus.message;
        account.lastSyncedAt = new Date();
        await account.save();
        
      } catch (error) {
        console.error(`   ❌ ${account.platform} test failed:`, error.message);
        
        connectionResults.push({
          accountId: account._id,
          platform: account.platform,
          username: account.username,
          status: 'error',
          message: error.message,
          connected: false,
          details: { error: error.message }
        });
        
        // Update connection status in database
        account.connected = false;
        account.syncStatus = 'error';
        account.syncError = error.message;
        account.lastSyncedAt = new Date();
        await account.save();
      }
    }
    
    const connectedCount = connectionResults.filter(r => r.connected).length;
    const summary = {
      totalAccounts: accounts.length,
      connectedAccounts: connectedCount,
      disconnectedAccounts: accounts.length - connectedCount,
      testTimestamp: new Date().toISOString()
    };
    
    console.log(`✅ Connection test completed: ${connectedCount}/${accounts.length} accounts connected`);
    
    res.json({ summary, results: connectionResults });
  } catch (error) {
    console.error('Test connections error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
});

// Enhanced account fixing endpoint
app.post('/api/debug/fix-accounts', authenticateToken, async (req, res) => {
  try {
    const { action = 'auto' } = req.body;
    const accounts = await Account.find({ userId: req.user.userId });
    const fixedAccounts = [];
    const actions = [];
    
    for (const account of accounts) {
      const hasRequiredCredentials = validateAccountCredentials(account);
      
      // Fix accounts marked as connected but missing credentials
      if (!hasRequiredCredentials && account.connected) {
        const missingCredentials = getMissingCredentials(account);
        
        account.connected = false;
        account.syncStatus = 'disconnected';
        account.syncError = `Missing credentials: ${missingCredentials.join(', ')}`;
        account.lastSyncedAt = new Date();
        
        await account.save();
        
        fixedAccounts.push({
          accountId: account._id,
          platform: account.platform,
          username: account.username,
          action: 'Marked as disconnected due to missing credentials',
          missingCredentials
        });
        
        actions.push(`Fixed ${account.platform} @${account.username} - marked as disconnected`);
      }
      
      // Fix accounts with stale sync status
      if (account.lastSyncedAt && 
          (Date.now() - new Date(account.lastSyncedAt).getTime()) > 24 * 60 * 60 * 1000) {
        account.syncStatus = 'stale';
        account.syncError = 'Account needs re-validation (last sync > 24h ago)';
        await account.save();
        
        actions.push(`Updated ${account.platform} @${account.username} - marked as stale`);
      }
    }
    
    res.json({
      message: `Fixed ${fixedAccounts.length} account(s)`,
      actionsPerformed: actions,
      fixedAccounts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Fix accounts error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🔄 Gracefully shutting down...');
  
  try {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database:', error.message);
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Received SIGTERM, shutting down...');
  
  try {
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database:', error.message);
  }
  
  process.exit(0);
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    message: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Start server
async function startServer() {
  const dbConnected = await connectToDatabase();
  
  if (dbConnected) {
    await initializeScheduler();
  } else {
    console.log('⚠️  Server starting without database connection');
    console.log('🔄 Will attempt to reconnect when needed');
  }
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 System status: http://localhost:${PORT}/api/status`);
    console.log('════════════════════════════════════════════════════════════');
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

module.exports = app;
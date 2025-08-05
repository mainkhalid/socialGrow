const express = require('express');
const router = express.Router();
const { 
  getDashboardAnalytics,
  getEngagementData, 
  getFollowerData, 
  getContentPerformance,
  getAudienceDemographics,
  getComparisonAnalytics
} = require('../controllers/analytics.controller');

// Dashboard overview - get comprehensive analytics
router.get('/dashboard', getDashboardAnalytics);

// Platform-specific analytics
router.get('/engagement/:platform', getEngagementData);
router.get('/followers/:platform', getFollowerData);
router.get('/content-performance/:platform', getContentPerformance);
router.get('/audience/:platform', getAudienceDemographics);

// Cross-platform comparison
router.get('/comparison', getComparisonAnalytics);

// Export router
module.exports = router;
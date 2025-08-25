const express = require('express');
const router = express.Router();
const { 
  getPosts, 
  createPost, 
  updatePost, 
  deletePost,
  getPostAnalytics,
  getSchedulerStatus,
  triggerScheduler,
  getConnectionHealth
} = require('../controllers/scheduler.controller');

// Post CRUD operations
router.get('/', getPosts);
router.post('/', createPost);
router.put('/:postId', updatePost);
router.delete('/:postId', deletePost);
router.get('/:postId/analytics', getPostAnalytics);

// Scheduler management endpoints (missing from your routes)
router.get('/stats', getSchedulerStatus);
router.get('/status', getSchedulerStatus); // Alias for stats
router.post('/trigger', triggerScheduler);
router.get('/health', getConnectionHealth);

// Additional endpoints your frontend expects
router.post('/start', async (req, res) => {
  try {
    const { startScheduler } = require('../services/scheduler.service');
    await startScheduler();
    res.json({ message: 'Scheduler started successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/stop', async (req, res) => {
  try {
    const { stopScheduler } = require('../services/scheduler.service');
    await stopScheduler();
    res.json({ message: 'Scheduler stopped successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/report', async (req, res) => {
  try {
    const { getPublishingReport } = require('../services/scheduler.service');
    const hours = parseInt(req.query.hours) || 24;
    const report = await getPublishingReport(hours);
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:postId/retry', async (req, res) => {
  try {
    const { postId } = req.params;
    const Post = require('../models/post.model');
    
    const post = await Post.findOne({
      _id: postId,
      userId: req.user.userId,
      status: 'failed'
    });

    if (!post) {
      return res.status(404).json({ message: 'Failed post not found' });
    }

    // Reset post to scheduled status
    post.status = 'scheduled';
    post.scheduledDate = new Date();
    post.publishError = '';
    post.failedAt = null;
    post.retryCount = (post.retryCount || 0) + 1;
    
    await post.save();
    res.json(post);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
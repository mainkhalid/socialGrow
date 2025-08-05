const express = require('express');
const router = express.Router();
const { 
  getPosts, 
  createPost, 
  updatePost, 
  deletePost,
  getPostAnalytics
} = require('../controllers/scheduler.controller');
router.get('/', getPosts);
router.post('/', createPost);
router.put('/:postId', updatePost);
router.delete('/:postId', deletePost);
router.get('/:postId/analytics', getPostAnalytics);
module.exports = router;
const express = require('express');
const router = express.Router();
const { 
  generateIdeas, 
  getSavedIdeas, 
  updateIdeaFeedback, 
  convertIdeaToPost,
  deleteIdea
} = require('../controllers/ideas.controller');
router.post('/generate', generateIdeas);
router.get('/', getSavedIdeas);
router.put('/:ideaId/feedback', updateIdeaFeedback);
router.post('/:ideaId/convert', convertIdeaToPost);
router.delete('/:ideaId', deleteIdea);
module.exports = router;
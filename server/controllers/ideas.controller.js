const Idea = require('../models/idea.model');
const User = require('../models/user.model');
const { generateContentIdeas } = require('../services/gemini.service');

// Generate content ideas using Gemini AI
const generateIdeas = async (req, res) => {
  try {
    const { prompt, platform, count } = req.body;
    
    // Check user's plan limits
    const user = await User.findById(req.user.userId);
    if (user.planUsage.ideas.used >= user.planUsage.ideas.total) {
      return res.status(403).json({ message: 'Idea generation limit reached for your plan' });
    }
    
    // Generate ideas using Gemini AI
    const result = await generateContentIdeas(
      prompt,
      platform,
      count || 4
    );
    
    // Check if there was an error or if we need to handle retry
    if (result.error && result.retryAfter) {
      return res.status(429).json({ 
        message: result.message,
        retryAfter: result.retryAfter,
        source: result.source,
        ideas: result.ideas // Still return fallback ideas
      });
    }
    
    // Extract the ideas array from the result object
    const generatedIdeas = result.ideas;
    
    // Save ideas to database
    const savedIdeas = [];
    for (const text of generatedIdeas) {
      const idea = new Idea({
        userId: req.user.userId,
        platform,
        prompt,
        generatedText: text,
        liked: false,
        disliked: false
      });
      await idea.save();
      savedIdeas.push(idea);
    }
    
    // Update user's idea usage
    user.planUsage.ideas.used += 1;
    await user.save();
    
    res.json({
      ideas: savedIdeas,
      source: result.source,
      message: result.message
    });
    
  } catch (error) {
    console.error('Generate ideas error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get saved ideas for a user
const getSavedIdeas = async (req, res) => {
  try {
    const { platform, liked } = req.query;
    const query = { userId: req.user.userId };
    
    if (platform) {
      query.platform = platform;
    }
    
    if (liked === 'true') {
      query.liked = true;
    } else if (liked === 'false') {
      query.liked = false;
    }
    
    const ideas = await Idea.find(query).sort({ createdAt: -1 });
    res.json(ideas);
  } catch (error) {
    console.error('Get saved ideas error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update idea feedback (like/dislike)
const updateIdeaFeedback = async (req, res) => {
  try {
    const { ideaId } = req.params;
    const { liked, disliked } = req.body;
    
    const idea = await Idea.findOne({
      _id: ideaId,
      userId: req.user.userId
    });
    
    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }
    
    if (liked !== undefined) idea.liked = liked;
    if (disliked !== undefined) idea.disliked = disliked;
    
    // If both are true, prioritize liked
    if (idea.liked && idea.disliked) {
      idea.disliked = false;
    }
    
    await idea.save();
    res.json(idea);
  } catch (error) {
    console.error('Update idea feedback error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Convert idea to scheduled post
const convertIdeaToPost = async (req, res) => {
  try {
    const { ideaId } = req.params;
    const { accountId, scheduledDate, mediaUrls } = req.body;
    
    const idea = await Idea.findOne({
      _id: ideaId,
      userId: req.user.userId
    });
    
    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }
    
    // Create a new post from this idea
    const Post = require('../models/post.model');
    const newPost = new Post({
      userId: req.user.userId,
      accountId,
      platform: idea.platform,
      content: idea.generatedText,
      mediaUrls: mediaUrls || [],
      scheduledDate: new Date(scheduledDate),
      status: 'scheduled'
    });
    
    await newPost.save();
    
    // Update the idea to mark as converted
    idea.convertedToPost = true;
    idea.postId = newPost._id;
    await idea.save();
    
    // Update user's post usage
    const user = await User.findById(req.user.userId);
    user.planUsage.posts.used += 1;
    await user.save();
    
    res.json({
      idea,
      post: newPost
    });
  } catch (error) {
    console.error('Convert idea to post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete an idea
const deleteIdea = async (req, res) => {
  try {
    const { ideaId } = req.params;
    
    const result = await Idea.deleteOne({
      _id: ideaId,
      userId: req.user.userId
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Idea not found' });
    }
    
    res.json({ message: 'Idea deleted successfully' });
  } catch (error) {
    console.error('Delete idea error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  generateIdeas,
  getSavedIdeas,
  updateIdeaFeedback,
  convertIdeaToPost,
  deleteIdea
};
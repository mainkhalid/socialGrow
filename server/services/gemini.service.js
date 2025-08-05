const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini AI with API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Fallback content ideas for when API is unavailable
const fallbackIdeas = {
  twitter: [
    "💡 Quick tip: [Share your expertise] #TipTuesday #Knowledge",
    "Behind the scenes: [Show your process] #BTS #Authentic",
    "Question for you: [Ask your audience something] What do you think?",
    "Monday motivation: [Inspirational quote or message] #MondayMotivation"
  ],
  instagram: [
    "✨ Transform your feed with these simple tips! Share your favorite in the comments below. #InstaTips #ContentCreator #Engagement",
    "📸 Behind the camera: The story you don't see. Swipe to see the magic happen! #BehindTheScenes #Process #Storytelling",
    "🌟 Your daily dose of inspiration. Save this post for later motivation! #Inspiration #Mindset #Growth",
    "💫 Let's talk about [your topic]. What's your experience? Drop it in the comments! #Community #Discussion #Share"
  ],
  facebook: [
    "Have you ever wondered about [topic]? Here's what I've learned through my experience, and I'd love to hear your thoughts too. Sometimes the best insights come from our community discussions, and I'm always amazed by the different perspectives people bring to the table.",
    "I wanted to share something that happened recently that really made me think. It's fascinating how small moments can lead to big realizations, and I think many of you might relate to this experience. What are your thoughts on [topic]?",
    "Let's have an honest conversation about [topic]. I've been thinking about this a lot lately, especially with everything that's happening in our industry. I'd love to know what your experience has been and what advice you might have for others.",
    "Quick question for everyone: What's one thing you wish you knew when you first started [relevant topic]? I'm always looking to learn from this amazing community, and I think sharing our experiences can help so many people."
  ]
};

// Rate limiting helper
class RateLimiter {
  constructor() {
    this.requests = [];
    this.maxRequestsPerMinute = 10; // Conservative limit for free tier
    this.maxRequestsPerDay = 50;    // Conservative daily limit
  }

  canMakeRequest() {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Clean old requests
    this.requests = this.requests.filter(time => time > oneDayAgo);

    const recentRequests = this.requests.filter(time => time > oneMinuteAgo);
    
    return recentRequests.length < this.maxRequestsPerMinute && 
           this.requests.length < this.maxRequestsPerDay;
  }

  recordRequest() {
    this.requests.push(Date.now());
  }

  getRetryAfter() {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const recentRequests = this.requests.filter(time => time > oneMinuteAgo);
    
    if (recentRequests.length >= this.maxRequestsPerMinute) {
      const oldestRecent = Math.min(...recentRequests);
      return Math.ceil((oldestRecent + 60 * 1000 - now) / 1000);
    }
    return 0;
  }
}

const rateLimiter = new RateLimiter();

/**
 * Generate fallback content ideas when API is unavailable
 * @param {string} prompt - User prompt for content ideas
 * @param {string} platform - Social media platform
 * @param {number} count - Number of ideas to generate
 * @returns {string[]} Array of fallback content ideas
 */
function generateFallbackIdeas(prompt, platform, count) {
  const baseFallbacks = fallbackIdeas[platform] || fallbackIdeas.twitter;
  
  // Try to customize fallbacks based on prompt keywords
  const keywords = prompt.toLowerCase().match(/\b\w+\b/g) || [];
  const relevantKeywords = keywords.filter(word => 
    !['content', 'post', 'idea', 'generate', 'create', 'social', 'media'].includes(word)
  );

  let customizedIdeas = baseFallbacks.map(idea => {
    if (relevantKeywords.length > 0) {
      const randomKeyword = relevantKeywords[Math.floor(Math.random() * relevantKeywords.length)];
      return idea.replace(/\[.*?\]/g, randomKeyword);
    }
    return idea.replace(/\[.*?\]/g, 'your topic');
  });

  // Shuffle and return requested count
  customizedIdeas = customizedIdeas.sort(() => 0.5 - Math.random());
  return customizedIdeas.slice(0, count);
}

/**
 * Generate content ideas using Gemini AI with fallback
 * @param {string} prompt - User prompt for content ideas
 * @param {string} platform - Social media platform (twitter, instagram, facebook)
 * @param {number} count - Number of ideas to generate
 * @returns {Promise<{ideas: string[], source: string, retryAfter?: number}>} Generated content ideas with metadata
 */
async function generateContentIdeas(prompt, platform, count) {
  // Check rate limits first
  if (!rateLimiter.canMakeRequest()) {
    const retryAfter = rateLimiter.getRetryAfter();
    console.log(`Rate limit exceeded. Using fallback. Retry after ${retryAfter}s`);
    
    return {
      ideas: generateFallbackIdeas(prompt, platform, count),
      source: 'fallback',
      retryAfter,
      message: `API rate limit exceeded. Try again in ${retryAfter} seconds.`
    };
  }

  try {
    // Record the request attempt
    rateLimiter.recordRequest();

    // Configure the model
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash", // Use flash model for better rate limits
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 512, // Reduced to save quota
      }
    });

    // Platform-specific constraints
    const platformConstraints = {
      twitter: "Keep responses under 280 characters. Include 1-2 relevant hashtags.",
      instagram: "Create engaging visual descriptions with 3-5 hashtags. Focus on aesthetic appeal.",
      facebook: "Write conversational content (50-150 words) that encourages engagement.",
    };

    // Build a more concise system prompt to save tokens
    const systemPrompt = `Generate ${count} ${platform} posts for: ${prompt}

Requirements:
- ${platformConstraints[platform] || ""}
- Return only the post content, one per line
- No numbering or explanations
- Each post should be complete and ready to publish`;

    // Generate content with Gemini
    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text();
    
    // Parse the response into separate ideas
    const ideas = responseText
      .split(/\n+/)
      .map((idea) => idea.trim())
      .filter((idea) => idea.length > 0 && !idea.match(/^\d+[.)]/)) // Remove numbered items
      .slice(0, count);

    // Validate we got enough ideas
    if (ideas.length < count) {
      const additionalIdeas = generateFallbackIdeas(prompt, platform, count - ideas.length);
      ideas.push(...additionalIdeas);
    }

    return {
      ideas: ideas.slice(0, count),
      source: 'gemini',
      message: 'Ideas generated successfully'
    };

  } catch (error) {
    console.error("Gemini AI generation error:", error);
    
    let retryAfter = 0;
    let errorMessage = "Failed to generate content ideas";

    // Handle specific error types
    if (error.status === 429) {
      // Extract retry delay from error if available
      if (error.errorDetails) {
        const retryInfo = error.errorDetails.find(detail => 
          detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
        );
        if (retryInfo && retryInfo.retryDelay) {
          retryAfter = parseInt(retryInfo.retryDelay.replace('s', ''));
        }
      }
      errorMessage = `API quota exceeded. Using fallback content. Try again in ${retryAfter || 60} seconds.`;
    } else if (error.status === 400) {
      errorMessage = "Invalid request. Check your prompt and try again.";
    } else if (error.status === 401) {
      errorMessage = "API key invalid. Please check your Gemini API configuration.";
    } else if (error.status === 403) {
      errorMessage = "Access denied. Check your API key permissions.";
    }

    // Return fallback ideas with error information
    return {
      ideas: generateFallbackIdeas(prompt, platform, count),
      source: 'fallback',
      retryAfter: retryAfter || 60,
      message: errorMessage,
      error: true
    };
  }
}

/**
 * Get current rate limit status
 * @returns {Object} Rate limit information
 */
function getRateLimitStatus() {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  
  const recentRequests = rateLimiter.requests.filter(time => time > oneMinuteAgo);
  const dailyRequests = rateLimiter.requests.filter(time => time > oneDayAgo);
  
  return {
    canMakeRequest: rateLimiter.canMakeRequest(),
    requestsLastMinute: recentRequests.length,
    requestsToday: dailyRequests.length,
    maxPerMinute: rateLimiter.maxRequestsPerMinute,
    maxPerDay: rateLimiter.maxRequestsPerDay,
    retryAfter: rateLimiter.getRetryAfter()
  };
}

module.exports = {
  generateContentIdeas,
  getRateLimitStatus,
  generateFallbackIdeas
};
import React, { useState, useEffect } from 'react'
import {
  BrainIcon,
  CopyIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  LoaderIcon,
  TrashIcon,
  CalendarIcon,
} from 'lucide-react'
import { usePlatform } from '../context/PlatformContext'

// API service functions
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const api = {
  async generateIdeas(prompt, platform, count = 4) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ideas/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ prompt, platform, count }),
      })
      
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorMessage
        } catch (e) {
          // If we can't parse JSON, use the status message
        }
        throw new Error(errorMessage)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Generate ideas error:', error)
      throw error
    }
  },

  async getSavedIdeas(platform = null, liked = null) {
    try {
      const params = new URLSearchParams()
      if (platform) params.append('platform', platform)
      if (liked !== null) params.append('liked', liked.toString())
      
      const response = await fetch(`${API_BASE_URL}/api/ideas?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      })
      
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorMessage
        } catch (e) {
          // If we can't parse JSON, use the status message
        }
        throw new Error(errorMessage)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Get saved ideas error:', error)
      throw error
    }
  },

  async updateIdeaFeedback(ideaId, feedback) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ideas/${ideaId}/feedback`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify(feedback),
      })
      
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorMessage
        } catch (e) {
          // If we can't parse JSON, use the status message
        }
        throw new Error(errorMessage)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Update idea feedback error:', error)
      throw error
    }
  },

  async deleteIdea(ideaId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ideas/${ideaId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      })
      
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorMessage
        } catch (e) {
          // If we can't parse JSON, use the status message
        }
        throw new Error(errorMessage)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Delete idea error:', error)
      throw error
    }
  },

  async convertIdeaToPost(ideaId, postData) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ideas/${ideaId}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify(postData),
      })
      
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorMessage
        } catch (e) {
          // If we can't parse JSON, use the status message
        }
        throw new Error(errorMessage)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Convert idea to post error:', error)
      throw error
    }
  }
}

const IdeaGenerator = () => {
  const { platform } = usePlatform()
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedIdeas, setGeneratedIdeas] = useState([])
  const [savedIdeas, setSavedIdeas] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showSaved, setShowSaved] = useState(false)

  const platformNames = {
    twitter: 'X (Twitter)',
    instagram: 'Instagram',
    facebook: 'Facebook',
  }

  const platformLimits = {
    twitter: '280 characters',
    instagram: 'Visual content with caption',
    facebook: 'Longer form content',
  }

  // Test API connection on component mount
  useEffect(() => {
    const testConnection = async () => {
  try {
    const token = localStorage.getItem('authToken'); // or your token key

    const response = await fetch(`${API_BASE_URL}/api/ideas`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok && response.status === 404) {
      setError('Backend API not found. Please ensure your server is running and routes are properly configured.');
    }
  } catch (err) {
    setError('Cannot connect to backend server. Please check if your server is running.');
  }
};

    
    testConnection()
  }, [])

  // Load saved ideas when component mounts or platform changes
  useEffect(() => {
    if (showSaved) {
      loadSavedIdeas()
    }
  }, [platform, showSaved])

  const loadSavedIdeas = async () => {
    try {
      setLoading(true)
      const ideas = await api.getSavedIdeas(platform)
      setSavedIdeas(ideas)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!prompt.trim()) return

    try {
      setGenerating(true)
      setError(null)
      
      const ideas = await api.generateIdeas(prompt, platform, 4)
      setGeneratedIdeas(ideas)
      
      // Clear the prompt after successful generation
      setPrompt('')
    } catch (err) {
      console.error('Generation error:', err)
      setError(`Failed to generate ideas: ${err.message}. Please check if your backend server is running on the correct port.`)
    } finally {
      setGenerating(false)
    }
  }

  const handleLike = async (idea) => {
    try {
      const updatedIdea = await api.updateIdeaFeedback(idea._id, {
        liked: !idea.liked,
        disliked: false
      })
      
      // Update the idea in the current list
      if (generatedIdeas.some(i => i._id === idea._id)) {
        setGeneratedIdeas(ideas =>
          ideas.map(i => i._id === idea._id ? updatedIdea : i)
        )
      }
      
      if (savedIdeas.some(i => i._id === idea._id)) {
        setSavedIdeas(ideas =>
          ideas.map(i => i._id === idea._id ? updatedIdea : i)
        )
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDislike = async (idea) => {
    try {
      const updatedIdea = await api.updateIdeaFeedback(idea._id, {
        liked: false,
        disliked: !idea.disliked
      })
      
      // Update the idea in the current list
      if (generatedIdeas.some(i => i._id === idea._id)) {
        setGeneratedIdeas(ideas =>
          ideas.map(i => i._id === idea._id ? updatedIdea : i)
        )
      }
      
      if (savedIdeas.some(i => i._id === idea._id)) {
        setSavedIdeas(ideas =>
          ideas.map(i => i._id === idea._id ? updatedIdea : i)
        )
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (ideaId) => {
    if (!confirm('Are you sure you want to delete this idea?')) return
    
    try {
      await api.deleteIdea(ideaId)
      
      // Remove from both lists
      setGeneratedIdeas(ideas => ideas.filter(i => i._id !== ideaId))
      setSavedIdeas(ideas => ideas.filter(i => i._id !== ideaId))
    } catch (err) {
      setError(err.message)
    }
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      // You could add a toast notification here
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
  }

  const renderIdea = (idea) => (
    <div key={idea._id} className="p-4">
      <p className="text-gray-800 mb-3">{idea.generatedText}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleLike(idea)}
            className={`p-1.5 rounded-full transition-colors ${
              idea.liked
                ? 'bg-green-100 text-green-600'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ThumbsUpIcon size={16} />
          </button>
          <button
            onClick={() => handleDislike(idea)}
            className={`p-1.5 rounded-full transition-colors ${
              idea.disliked
                ? 'bg-red-100 text-red-600'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ThumbsDownIcon size={16} />
          </button>
          <button
            onClick={() => handleDelete(idea._id)}
            className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <TrashIcon size={16} />
          </button>
        </div>
        <div className="flex items-center space-x-2">
          {idea.convertedToPost && (
            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
              Converted to Post
            </span>
          )}
          <button
            onClick={() => copyToClipboard(idea.generatedText)}
            className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <CopyIcon size={14} className="mr-1" />
            Copy
          </button>
        </div>
      </div>
      {showSaved && (
        <div className="mt-2 text-xs text-gray-500">
          Created: {new Date(idea.createdAt).toLocaleDateString()}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">
          AI Content Idea Generator
        </h1>
        <p className="text-gray-600">
          Generate content ideas for{' '}
          <span className="font-medium">{platformNames[platform]}</span> using
          Gemini AI
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setShowSaved(false)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            !showSaved
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Generate New Ideas
        </button>
        <button
          onClick={() => {
            setShowSaved(true)
            loadSavedIdeas()
          }}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            showSaved
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Saved Ideas
        </button>
      </div>

      {!showSaved && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                What kind of content do you want to create?
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={`E.g., "Generate post ideas about our new product launch for ${platformNames[platform]}"`}
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Optimized for {platformLimits[platform]}
              </div>
              <button
                type="submit"
                disabled={generating || !prompt.trim()}
                className={`px-4 py-2 rounded-lg flex items-center text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  platform === 'twitter'
                    ? 'bg-blue-500 hover:bg-blue-600'
                    : platform === 'instagram'
                    ? 'bg-pink-500 hover:bg-pink-600'
                    : 'bg-indigo-500 hover:bg-indigo-600'
                }`}
              >
                {generating ? (
                  <>
                    <LoaderIcon size={18} className="animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <BrainIcon size={18} className="mr-2" />
                    Generate Ideas
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Generated Ideas */}
      {!showSaved && generatedIdeas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-medium">Generated Content Ideas</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {generatedIdeas.map(renderIdea)}
          </div>
        </div>
      )}

      {/* Saved Ideas */}
      {showSaved && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-medium">
              Saved Ideas for {platformNames[platform]}
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center">
              <LoaderIcon size={24} className="animate-spin mx-auto mb-2" />
              <p className="text-gray-600">Loading saved ideas...</p>
            </div>
          ) : savedIdeas.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {savedIdeas.map(renderIdea)}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              No saved ideas found for {platformNames[platform]}
            </div>
          )}
        </div>
      )}

      {/* Tips Section */}
      <div className="mt-8 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="font-medium text-gray-800 mb-2">
          Tips for effective {platformNames[platform]} content
        </h3>
        <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
          {platform === 'twitter' && (
            <>
              <li>Keep posts concise and under 280 characters</li>
              <li>Use hashtags strategically (2-3 per post)</li>
              <li>Ask questions to encourage engagement</li>
              <li>Share timely content related to trending topics</li>
            </>
          )}
          {platform === 'instagram' && (
            <>
              <li>Focus on high-quality visuals that tell a story</li>
              <li>Use up to 30 hashtags to increase discoverability</li>
              <li>Create carousel posts for higher engagement</li>
              <li>Keep captions conversational and include a call to action</li>
            </>
          )}
          {platform === 'facebook' && (
            <>
              <li>Longer form content performs well (around 100-250 words)</li>
              <li>Include a compelling image or video with each post</li>
              <li>Ask questions to encourage comments and discussion</li>
              <li>Post during peak hours when your audience is most active</li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}

export default IdeaGenerator
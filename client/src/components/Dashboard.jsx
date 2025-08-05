import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart2Icon,
  CalendarIcon,
  BrainIcon,
  TrendingUpIcon,
  UsersIcon,
  MessageSquareIcon,
} from 'lucide-react'
import { usePlatform } from '../context/PlatformContext'
import { useAuth } from '../context/AuthContext'
import PlatformStats from './PlatformStats'
import axios from 'axios'

const Dashboard = () => {
  const { platform } = usePlatform()
  const { getAuthHeaders } = useAuth()
  
  // Add state to store platform stats
  const [platformStats, setPlatformStats] = useState({
    followers: 0,
    posts: 0,
    engagement: '0%'
  })
  const [loading, setLoading] = useState(true)

  const platformColors = {
    twitter: 'bg-blue-500',
    instagram: 'bg-pink-500',
    facebook: 'bg-indigo-500',
  }

  const platformNames = {
    twitter: 'X (Twitter)',
    instagram: 'Instagram',
    facebook: 'Facebook',
  }

  // Fetch platform-specific stats
  const fetchPlatformStats = async () => {
    try {
      setLoading(true)
      const headers = getAuthHeaders()
      
      // Fetch follower data for current platform
      const followerRes = await axios.get(
        `/api/analytics/followers/${platform}?timeframe=month`,
        { headers }
      )
      
      if (followerRes.data) {
        const accountData = followerRes.data
        console.log("Dashboard - Follower account data:", accountData)
        console.log("Dashboard - Current platform:", platform)
        
        // Handle both nested stats structure and flattened structure
        let followerCount = 0
        let postsCount = 0
        let engagementRate = 0
        
        if (accountData) {
          // Check for nested stats structure first
          if (accountData.stats && typeof accountData.stats.followers !== 'undefined') {
            followerCount = accountData.stats.followers
            postsCount = accountData.stats.posts || 0
            engagementRate = accountData.stats.engagement || 0
            console.log("Dashboard - Using nested stats structure")
          } 
          // Check for flattened structure
          else if (typeof accountData.followers !== 'undefined') {
            followerCount = accountData.followers
            postsCount = accountData.posts || 0
            engagementRate = accountData.engagement || 0
            console.log("Dashboard - Using flattened structure")
          }
          
          // Update platform stats
          setPlatformStats({
            followers: parseInt(followerCount) || 0,
            posts: parseInt(postsCount) || 0,
            engagement: engagementRate ? `${engagementRate}%` : '0%'
          })
          
          console.log("✅ Dashboard - Set platformStats:", {
            followers: followerCount,
            posts: postsCount,
            engagement: engagementRate
          })
        }
      }
    } catch (error) {
      console.error("Error fetching platform stats:", error)
      // Set default values on error
      setPlatformStats({
        followers: 0,
        posts: 0,
        engagement: '0%'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlatformStats()
  }, [platform])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-600">
          Currently managing:{' '}
          <span className="font-medium">{platformNames[platform]}</span>
        </p>
      </header>

      
      {loading ? (
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-32 bg-gray-200 rounded-xl"></div>
            <div className="h-32 bg-gray-200 rounded-xl"></div>
            <div className="h-32 bg-gray-200 rounded-xl"></div>
          </div>
        </div>
      ) : (
        <PlatformStats 
          platform={platform} 
          stats={platformStats}  
          key={platform}  
        />
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          to="/analytics"
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <div
              className={`p-3 rounded-lg ${platform === 'twitter' ? 'bg-blue-100' : platform === 'instagram' ? 'bg-pink-100' : 'bg-indigo-100'}`}
            >
              <BarChart2Icon
                size={24}
                className={
                  platform === 'twitter'
                    ? 'text-blue-500'
                    : platform === 'instagram'
                      ? 'text-pink-500'
                      : 'text-indigo-500'
                }
              />
            </div>
            <span className="text-sm text-gray-500">View details</span>
          </div>
          <h2 className="text-lg font-semibold mb-1">Analytics</h2>
          <p className="text-gray-600 text-sm">
            Track performance metrics and audience insights
          </p>
        </Link>

        <Link
          to="/scheduler"
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <div
              className={`p-3 rounded-lg ${platform === 'twitter' ? 'bg-blue-100' : platform === 'instagram' ? 'bg-pink-100' : 'bg-indigo-100'}`}
            >
              <CalendarIcon
                size={24}
                className={
                  platform === 'twitter'
                    ? 'text-blue-500'
                    : platform === 'instagram'
                      ? 'text-pink-500'
                      : 'text-indigo-500'
                }
              />
            </div>
            <span className="text-sm text-gray-500">View details</span>
          </div>
          <h2 className="text-lg font-semibold mb-1">Post Scheduler</h2>
          <p className="text-gray-600 text-sm">
            Plan and schedule your content calendar
          </p>
        </Link>

        <Link
          to="/ideas"
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <div
              className={`p-3 rounded-lg ${platform === 'twitter' ? 'bg-blue-100' : platform === 'instagram' ? 'bg-pink-100' : 'bg-indigo-100'}`}
            >
              <BrainIcon
                size={24}
                className={
                  platform === 'twitter'
                    ? 'text-blue-500'
                    : platform === 'instagram'
                      ? 'text-pink-500'
                      : 'text-indigo-500'
                }
              />
            </div>
            <span className="text-sm text-gray-500">View details</span>
          </div>
          <h2 className="text-lg font-semibold mb-1">Idea Generator</h2>
          <p className="text-gray-600 text-sm">
            Get AI-powered content suggestions
          </p>
        </Link>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center">
              <div
                className={`w-2 h-2 rounded-full ${platformColors[platform]} mr-2`}
              ></div>
              <p className="text-sm text-gray-700">
                <span className="font-medium">Post scheduled</span> for tomorrow
                at 9:00 AM
              </p>
              <span className="ml-auto text-xs text-gray-500">2h ago</span>
            </div>
          </div>
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center">
              <div
                className={`w-2 h-2 rounded-full ${platformColors[platform]} mr-2`}
              ></div>
              <p className="text-sm text-gray-700">
                <span className="font-medium">5 content ideas</span> generated
                for your campaign
              </p>
              <span className="ml-auto text-xs text-gray-500">5h ago</span>
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center">
              <div
                className={`w-2 h-2 rounded-full ${platformColors[platform]} mr-2`}
              ></div>
              <p className="text-sm text-gray-700">
                <span className="font-medium">Analytics report</span> for last
                week is ready
              </p>
              <span className="ml-auto text-xs text-gray-500">1d ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
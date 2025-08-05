// First, update your PlatformStats component to add debugging:

import React from 'react'
import {
  TrendingUpIcon,
  UsersIcon,
  MessageSquareIcon,
  ImageIcon,
} from 'lucide-react'

const PlatformStats = ({ platform, stats }) => {
  // Add debugging to see what data is being passed
  console.log("🔍 PlatformStats received:", { platform, stats });
  console.log("🔍 Followers from PlatformStats:", stats?.followers);

  const platformColors = {
    twitter: 'from-blue-500 to-blue-600',
    instagram: 'from-pink-500 to-purple-600',
    facebook: 'from-indigo-500 to-indigo-600',
  }

  const iconBg = {
    twitter: 'bg-blue-100',
    instagram: 'bg-pink-100',
    facebook: 'bg-indigo-100',
  }

  const iconColor = {
    twitter: 'text-blue-500',
    instagram: 'text-pink-500',
    facebook: 'text-indigo-500',
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Followers */}
      <div
        className={`rounded-xl overflow-hidden bg-gradient-to-br ${platformColors[platform]} text-white shadow-lg`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Followers</h3>
            <UsersIcon size={20} />
          </div>
          <p className="text-3xl font-bold">
            {stats?.followers?.toLocaleString() ?? 0}
          </p>
          {/* Add debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-2 text-xs opacity-75">
              Debug - Platform: {platform}, Raw: {stats?.followers}
            </div>
          )}
          <div className="mt-4 flex items-center">
            <TrendingUpIcon size={16} />
            <span className="ml-1 text-sm">+2.4% this week</span>
          </div>
        </div>
      </div>

      
      {/* Engagement */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-800">Engagement Rate</h3>
            <div className={`p-2 rounded-lg ${iconBg[platform]}`}>
              <MessageSquareIcon size={18} className={iconColor[platform]} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-800">
            {stats?.engagement ?? '0%'}
          </p>
          <div className="mt-4 flex items-center text-green-500">
            <TrendingUpIcon size={16} />
            <span className="ml-1 text-sm">+0.8% this week</span>
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-800">Total Posts</h3>
            <div className={`p-2 rounded-lg ${iconBg[platform]}`}>
              <ImageIcon size={18} className={iconColor[platform]} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-800">
            {stats?.posts ?? 0}
          </p>
          <div className="mt-4 flex items-center text-gray-500">
            <span className="text-sm">Last post: 2 days ago</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlatformStats


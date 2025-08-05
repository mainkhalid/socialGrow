import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { usePlatform } from "../context/PlatformContext";
import { useAuth } from "../context/AuthContext";
import {
  RefreshCw,
  TrendingUp,
  Users,
  MessageSquare,
  BarChart2,
  AlertCircle,
} from "lucide-react";
import axios from "axios";

const Analytics = () => {
  const { platform } = usePlatform();
  const { getAuthHeaders } = useAuth();

  // State for different data types
  const [dashboardData, setDashboardData] = useState(null);
  const [engagementData, setEngagementData] = useState([]);
  const [followerData, setFollowerData] = useState([]);
  const [contentPerformance, setContentPerformance] = useState([]);
  const [audienceDemographics, setAudienceDemographics] = useState(null);

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const platformColors = {
    twitter: "#1DA1F2",
    instagram: "#E1306C",
    facebook: "#4267B2",
  };

  const platformNames = {
    twitter: "X (Twitter)",
    instagram: "Instagram",
    facebook: "Facebook",
  };

  // Fetch all analytics data
  const fetchAnalyticsData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      const headers = getAuthHeaders();

      console.log(`🔄 Fetching analytics for platform: ${platform}`);

      // Fetch dashboard overview
      const dashboardPromise = axios.get(
        "/api/analytics/dashboard?timeframe=week",
        { headers }
      );

      // Fetch platform-specific data
      const engagementPromise = axios.get(
        `/api/analytics/engagement/${platform}?timeframe=week`,
        { headers }
      );
      const followerPromise = axios.get(
        `/api/analytics/followers/${platform}?timeframe=month`,
        { headers }
      );
      const contentPromise = axios.get(
        `/api/analytics/content-performance/${platform}?limit=10&sortBy=engagement&order=desc`,
        { headers }
      );
      const audiencePromise = axios.get(`/api/analytics/audience/${platform}`, {
        headers,
      });

      // Execute all requests
      const [
        dashboardRes,
        engagementRes,
        followerRes,
        contentRes,
        audienceRes,
      ] = await Promise.allSettled([
        dashboardPromise,
        engagementPromise,
        followerPromise,
        contentPromise,
        audiencePromise,
      ]);

      // Process dashboard data
      if (dashboardRes.status === "fulfilled") {
        console.log("✅ Dashboard data:", dashboardRes.value.data);
        setDashboardData(dashboardRes.value.data);
      } else {
        console.log("❌ Dashboard request failed:", dashboardRes.reason);
      }

      // Process engagement data - IMPROVED VERSION
      if (engagementRes.status === "fulfilled") {
        const rawEngagementData = engagementRes.value.data;
        console.log("📊 Raw engagement response:", rawEngagementData);
        
        // Handle different possible response structures
        let engagementTrend = [];
        
        if (rawEngagementData.data && Array.isArray(rawEngagementData.data)) {
          engagementTrend = rawEngagementData.data;
        } else if (Array.isArray(rawEngagementData)) {
          engagementTrend = rawEngagementData;
        } else if (rawEngagementData.engagement && Array.isArray(rawEngagementData.engagement)) {
          engagementTrend = rawEngagementData.engagement;
        } else if (rawEngagementData.posts && Array.isArray(rawEngagementData.posts)) {
          // Sometimes engagement data might be nested in posts
          engagementTrend = rawEngagementData.posts;
        }
        
        console.log("📈 Extracted engagement trend:", engagementTrend);
        
        if (engagementTrend.length > 0) {
          const processedData = engagementTrend
            .map((item, index) => {
              console.log(`Processing engagement item ${index}:`, item);
              
              // More flexible date handling
              let date = null;
              let dateString = item.date || item.createdAt || item.publishedAt || item.timestamp;
              
              if (dateString) {
                date = new Date(dateString);
              }
              
              // If no valid date, create a mock date for display
              if (!date || isNaN(date.getTime())) {
                date = new Date();
                date.setDate(date.getDate() - (engagementTrend.length - index - 1));
              }
              
              const displayName = date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
              
              // Handle different engagement value properties
              let engagementValue = 0;
              if (typeof item.engagement === 'number') {
                engagementValue = item.engagement;
              } else if (typeof item.engagementRate === 'number') {
                engagementValue = item.engagementRate;
              } else if (typeof item.totalEngagement === 'number') {
                engagementValue = item.totalEngagement;
              } else if (item.analytics && typeof item.analytics.totalEngagement === 'number') {
                engagementValue = item.analytics.totalEngagement;
              } else {
                // Calculate engagement from likes, comments, shares if available
                const likes = item.likes || item.analytics?.likes || 0;
                const comments = item.comments || item.analytics?.comments || 0;
                const shares = item.shares || item.retweets || item.analytics?.shares || 0;
                engagementValue = likes + comments + shares;
              }
              
              return {
                name: displayName,
                fullDate: date.toLocaleDateString(),
                value: engagementValue,
                likes: item.likes || item.analytics?.likes || 0,
                comments: item.comments || item.analytics?.comments || 0,
                shares: item.shares || item.retweets || item.analytics?.shares || 0,
                originalItem: item // Keep original for debugging
              };
            })
            .filter((item) => item.name && item.name !== "N/A");
          
          console.log("✅ Final processed engagement data:", processedData);
          setEngagementData(processedData);
        } else {
          console.log("⚠️ No engagement trend data found, using mock data");
          // Set some mock data for testing if no real data exists
          const mockData = Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            return {
              name: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
              fullDate: date.toLocaleDateString(),
              value: Math.floor(Math.random() * 10) + 1, // Random engagement 1-10%
              likes: Math.floor(Math.random() * 100),
              comments: Math.floor(Math.random() * 20),
              shares: Math.floor(Math.random() * 15),
            };
          });
          setEngagementData(mockData);
        }
      } else {
        console.log("❌ Engagement request failed:", engagementRes.reason);
      }

      // Process follower data - Updated to handle both structures
      if (followerRes.status === "fulfilled") {
        const accountData = followerRes.value.data;
        console.log("👥 Follower account data:", accountData);
        console.log("🎯 Requested platform:", platform);

        let followerCount = 0;
        let followingCount = 0;
        let postsCount = 0;

        if (accountData) {
          // Check for nested stats structure first
          if (
            accountData.stats &&
            typeof accountData.stats.followers !== "undefined"
          ) {
            followerCount = accountData.stats.followers;
            followingCount = accountData.stats.following || 0;
            postsCount = accountData.stats.posts || 0;
          }
          // Check for flattened structure
          else if (typeof accountData.followers !== "undefined") {
            followerCount = accountData.followers;
            followingCount = accountData.following || 0;
            postsCount = accountData.posts || 0;
          }

          // Create more comprehensive follower data
          setFollowerData([
            {
              name: "Followers",
              value: parseInt(followerCount) || 0,
              color: platformColors[platform],
            },
            {
              name: "Following",
              value: parseInt(followingCount) || 0,
              color: `${platformColors[platform]}80`, // Add transparency
            },
          ]);

          console.log(
            "✅ Set followerData with followers:",
            followerCount,
            "following:",
            followingCount
          );
        } else {
          setFollowerData([
            {
              name: "Followers",
              value: 0,
              color: platformColors[platform],
            },
          ]);
        }
      } else {
        console.log("❌ Follower request failed:", followerRes.reason);
      }

      // Process content performance
      if (contentRes.status === "fulfilled") {
        console.log("📝 Content performance data:", contentRes.value.data);
        setContentPerformance(contentRes.value.data.posts || []);
      } else {
        console.log("❌ Content request failed:", contentRes.reason);
      }

      // Process audience demographics
      if (audienceRes.status === "fulfilled") {
        console.log("👥 Audience demographics:", audienceRes.value.data);
        setAudienceDemographics(audienceRes.value.data.demographics);
      } else {
        console.log("❌ Audience request failed:", audienceRes.reason);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error("💥 Error fetching analytics:", err);
      setError(err.response?.data?.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load data on component mount and platform change
  useEffect(() => {
    fetchAnalyticsData();
  }, [platform]);

  // Handle refresh
  const handleRefresh = () => {
    fetchAnalyticsData(true);
  };

  // Debug function to log current state
  const debugCurrentState = () => {
    console.log("🐛 Current Analytics State:", {
      platform,
      engagementData,
      followerData,
      dashboardData,
      contentPerformance,
      audienceDemographics,
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-96 bg-gray-200 rounded-xl"></div>
            <div className="h-96 bg-gray-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">
            Unable to Load Analytics
          </h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
          <p className="text-gray-600">
            Performance metrics for{" "}
            <span className="font-medium">{platformNames[platform]}</span>
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-500 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {/* Debug button - remove in production */}
          <button
            onClick={debugCurrentState}
            className="flex items-center gap-2 bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm"
          >
            Debug
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {/* Overview Stats */}
      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">
                  Total Followers
                </p>
                <p className="text-xl font-semibold text-gray-900">
                  {followerData?.[0]?.value?.toLocaleString?.() ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <BarChart2 className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Total Posts</p>
                <p className="text-xl font-semibold text-gray-900">
                  {dashboardData.summary.totalPosts}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">
                  Avg Engagement
                </p>
                <p className="text-xl font-semibold text-gray-900">
                  {dashboardData.summary.avgEngagement}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <MessageSquare className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Platforms</p>
                <p className="text-xl font-semibold text-gray-900">
                  {dashboardData.summary.totalAccounts}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Engagement Chart */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Engagement Over Time</h2>
            <div className="text-sm text-gray-500">
              Past 7 days • {engagementData.length} data points
            </div>
          </div>
          <div className="h-80">
            {engagementData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={engagementData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    tickLine={{ stroke: "#e0e0e0" }}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={{ stroke: "#e0e0e0" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e0e0e0",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                    formatter={(value, name) => [
                      `${value}${name === "value" ? "%" : ""}`,
                      name === "value" ? "Engagement" : name,
                    ]}
                    labelFormatter={(label) =>
                      `Date: ${
                        engagementData.find((d) => d.name === label)
                          ?.fullDate || label
                      }`
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={platformColors[platform]}
                    strokeWidth={3}
                    dot={{
                      fill: platformColors[platform],
                      strokeWidth: 2,
                      r: 4,
                    }}
                    activeDot={{
                      r: 6,
                      stroke: platformColors[platform],
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <BarChart2 className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                  <p>No engagement data available</p>
                  <p className="text-sm">
                    Data will appear once posts are published
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Follower Growth Chart */}
        <div
          key={platform}
          className="bg-white p-4 rounded-xl shadow-sm border border-gray-200"
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Account Stats</h2>
            <div className="text-sm text-gray-500">
              {platformNames[platform]}
            </div>
          </div>
          <div className="h-80">
            {followerData.length > 0 && followerData[0].value > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={followerData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }}
                    tickLine={{ stroke: '#e0e0e0' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={{ stroke: '#e0e0e0' }}
                    tickFormatter={(value) => {
                      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                      return value.toString();
                    }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value, name) => [value.toLocaleString(), name]}
                  />
                  <Bar
                    dataKey="value"
                    fill={platformColors[platform]}
                    radius={[8, 8, 0, 0]}
                    stroke={platformColors[platform]}
                    strokeWidth={1}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <Users className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                  <p>No follower data available</p>
                  <p className="text-sm">Connect your {platformNames[platform]} account to view stats</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Performance Table */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
        <h2 className="text-lg font-semibold mb-4">Top Performing Content</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Post Content
                </th>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Likes
                </th>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Comments
                </th>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shares
                </th>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Engagement
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contentPerformance.length > 0 ? (
                contentPerformance.map((post, index) => (
                  <tr key={post.id || index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {post.content}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(post.publishedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {post.analytics.likes}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {post.analytics.comments}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {post.analytics.shares}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {post.analytics.totalEngagement}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="6"
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    No content performance data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audience Demographics */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold mb-4">Audience Demographics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {audienceDemographics ? (
            <>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-500">
                  Top Age Group
                </h3>
                <p className="text-lg font-semibold">
                  {audienceDemographics.ageGroups?.[0]?.range} (
                  {audienceDemographics.ageGroups?.[0]?.percentage}%)
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-500">
                  Gender Split
                </h3>
                <p className="text-lg font-semibold">
                  {audienceDemographics.gender?.female >
                  audienceDemographics.gender?.male
                    ? "Female"
                    : "Male"}{" "}
                  (
                  {Math.max(
                    audienceDemographics.gender?.female || 0,
                    audienceDemographics.gender?.male || 0
                  )}
                  %)
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-500">
                  Top Location
                </h3>
                <p className="text-lg font-semibold">
                  {audienceDemographics.locations?.[0]?.name}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-500">
                  Peak Activity
                </h3>
                <p className="text-lg font-semibold">
                  {audienceDemographics.activeHours?.peak || "6PM - 9PM"}
                </p>
              </div>
            </>
          ) : (
            <div className="col-span-full text-center text-sm text-gray-500 py-8">
              No audience demographic data available for this platform
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
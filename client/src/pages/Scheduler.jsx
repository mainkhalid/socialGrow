import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { usePlatform } from "../context/PlatformContext";
import { 
  Plus, 
  AlertCircle, 
  CheckCircle, 
  WifiOff, 
  Calendar as CalendarIcon, 
  Clock, 
  Trash2 as TrashIcon,
  RefreshCw,
  Activity,
  AlertTriangle,
  ExternalLink,
  Info,
  Zap,
  PlayCircle,
  PauseCircle,
  Upload,
  X,
  Image as ImageIcon,
  Video,
  File
} from "lucide-react";

const platformNames = {
  twitter: "Twitter",
  instagram: "Instagram", 
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

const platformIcons = {
  twitter: <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">T</div>,
  instagram: <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-white text-xs">I</div>,
  facebook: <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs">F</div>,
  linkedin: <div className="w-6 h-6 bg-blue-700 rounded-full flex items-center justify-center text-white text-xs">L</div>,
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const Scheduler = () => {
  const { platform } = usePlatform();
  const { isAuthenticated } = useAuth();
  
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [pagination, setPagination] = useState({ limit: 20, offset: 0, total: 0 });
  const [schedulerStats, setSchedulerStats] = useState(null);
  const [publishingReport, setPublishingReport] = useState(null);
  const [refreshingStats, setRefreshingStats] = useState(false);
  
  // Media upload states
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadConfig, setUploadConfig] = useState(null);

  const [newPost, setNewPost] = useState({
    content: "",
    date: "",
    time: "",
    mediaFiles: [],
    accountId: "",
  });

  const getStatusIcon = useCallback((post) => {
    switch (post.status) {
      case "published":
        return <CheckCircle size={16} className="text-green-500" title="Published successfully" />;
      case "failed":
        return <AlertCircle size={16} className="text-red-500" title={`Failed: ${post.publishError || 'Unknown error'}`} />;
      case "scheduled":
        return <Clock size={16} className="text-blue-500" title="Waiting to be published" />;
      default:
        return <WifiOff size={16} className="text-gray-400" title="Unknown status" />;
    }
  }, []);

  const getAccountHealthIcon = useCallback((account) => {
    if (!account.connected) {
      return <WifiOff size={16} className="text-red-500" title="Disconnected" />;
    }
    if (account.connectionHealthy === false) {
      return <AlertTriangle size={16} className="text-yellow-500" title="Connection issues" />;
    }
    return <CheckCircle size={16} className="text-green-500" title="Connected and healthy" />;
  }, []);
  
  const getMediaIcon = useCallback((resourceType, format) => {
    if (resourceType === 'video') {
      return <Video size={16} className="text-blue-500" />;
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(format?.toLowerCase())) {
      return <ImageIcon size={16} className="text-green-500" />;
    }
    return <File size={16} className="text-gray-500" />;
  }, []);

  const availableAccounts = useMemo(() => {
    return accounts.filter((acc) => acc.platform?.toLowerCase() === platform.toLowerCase());
  }, [accounts, platform]);

  const healthyAccounts = useMemo(() => {
    return availableAccounts.filter(acc => acc.connected && acc.connectionHealthy !== false);
  }, [availableAccounts]);
  
  const loadAccounts = useCallback(async () => {
    try {
      const response = await axios.get("/api/accounts");
      let accountsData = response.data.accounts || response.data.data || response.data || [];
      
      setAccounts(accountsData);

      const platformAccount = accountsData.find(
        (acc) => acc.platform?.toLowerCase() === platform.toLowerCase() && 
                 acc.connected && 
                 acc.connectionHealthy !== false
      );

      if (platformAccount) {
        const accountId = platformAccount._id || platformAccount.id;
        setSelectedAccountId(accountId);
        setNewPost((prev) => ({ ...prev, accountId }));
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load accounts");
    }
  }, [platform]);

  const loadPosts = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams({
        platform: platform,
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });

      const response = await axios.get(`/api/scheduler?${queryParams}`);
      const data = response.data;
      
      setScheduledPosts(data.posts || []);
      setPagination((prev) => ({
        ...prev,
        total: data.pagination?.total || 0,
      }));
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load posts");
    }
  }, [platform, pagination.limit, pagination.offset]);
  
  const loadSchedulerStats = useCallback(async () => {
    try {
      setRefreshingStats(true);
      const [statsResponse, reportResponse] = await Promise.all([
        axios.get("/api/scheduler/stats"),
        axios.get("/api/scheduler/report?hours=24")
      ]);
      
      setSchedulerStats(statsResponse.data);
      setPublishingReport(reportResponse.data);
    } catch (err) {
      console.warn("Could not load scheduler stats:", err.message);
    } finally {
      setRefreshingStats(false);
    }
  }, []);
  
  const loadUploadConfig = useCallback(async () => {
    if (platform && isAuthenticated) {
      try {
        const response = await axios.get(`/api/media/config?platform=${platform}`);
        setUploadConfig(response.data);
      } catch (error) {
        console.error('Failed to load upload config:', error);
      }
    }
  }, [platform, isAuthenticated]);

  const loadInitialData = useCallback(async () => {
    if (isAuthenticated) {
      try {
        setLoading(true);
        setError(null);
        await Promise.all([loadAccounts(), loadPosts(), loadSchedulerStats(), loadUploadConfig()]);
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, loadAccounts, loadPosts, loadSchedulerStats, loadUploadConfig]);

  useEffect(() => {
    loadInitialData();
  }, [platform, loadInitialData]);

  useEffect(() => {
    if (showStatsModal) {
      const interval = setInterval(loadSchedulerStats, 30000);
      return () => clearInterval(interval);
    }
  }, [showStatsModal, loadSchedulerStats]);

  const uploadMediaFiles = async (files) => {
    setUploadingMedia(true);
    setUploadProgress(0);
    
    try {
      if (!uploadConfig) {
        throw new Error('Upload configuration not loaded');
      }

      const formData = new FormData();
      Array.from(files).forEach(file => formData.append('files', file));
      formData.append('platform', platform);

      const response = await axios.post('/api/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          setUploadProgress(progress);
        },
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Upload failed');
      }

      return response.data.files;
    } catch (error) {
      throw new Error(`Upload failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setUploadingMedia(false);
      setUploadProgress(0);
    }
  };

  const validateMediaFile = (file) => {
    if (!uploadConfig) return { valid: false, message: 'Upload configuration not loaded' };

    const maxSizes = uploadConfig.maxFileSize[platform];
    if (!maxSizes) return { valid: false, message: 'Unsupported platform' };

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      return { valid: false, message: `Only images and videos are supported` };
    }

    const maxSize = isVideo ? maxSizes.video : maxSizes.image;
    const fileSizeMB = file.size / (1024 * 1024);

    if (fileSizeMB > maxSize) {
      return { 
        valid: false, 
        message: `${isImage ? 'Image' : 'Video'} must be less than ${maxSize}MB (current: ${fileSizeMB.toFixed(1)}MB)` 
      };
    }
    return { valid: true };
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0 || !uploadConfig) {
      !uploadConfig && setError('Upload configuration not loaded. Please try again.');
      return;
    }

    const maxFiles = uploadConfig.maxFiles[platform];
    const currentMediaCount = newPost.mediaFiles.length;
    const totalFiles = currentMediaCount + files.length;
    
    if (totalFiles > maxFiles) {
      setError(`${platformNames[platform]} allows a maximum of ${maxFiles} media files per post`);
      return;
    }

    for (const file of files) {
      const validation = validateMediaFile(file);
      if (!validation.valid) {
        setError(`${file.name}: ${validation.message}`);
        return;
      }
    }

    if (uploadConfig.userStorage) {
      const totalSizeMB = files.reduce((sum, file) => sum + (file.size / (1024 * 1024)), 0);
      const availableStorageMB = uploadConfig.userStorage.limit - uploadConfig.userStorage.used;
      
      if (totalSizeMB > availableStorageMB) {
        setError(`Not enough storage space. ${totalSizeMB.toFixed(1)}MB required, ${availableStorageMB.toFixed(1)}MB available.`);
        return;
      }
    }

    try {
      const uploadedFiles = await uploadMediaFiles(files);
      setNewPost(prev => ({ ...prev, mediaFiles: [...prev.mediaFiles, ...uploadedFiles] }));
      setError(null);
      if (uploadedFiles.length < files.length) {
        setError(`${uploadedFiles.length} of ${files.length} files uploaded successfully. Some files failed.`);
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const removeMediaFile = async (index) => {
    const mediaFile = newPost.mediaFiles[index];
    if (mediaFile && mediaFile.publicId) {
      try {
        await axios.delete('/api/media', { data: { publicId: mediaFile.publicId, resourceType: mediaFile.resourceType } });
      } catch (error) {
        console.error('Failed to delete media from Cloudinary:', error);
      }
    }
    setNewPost(prev => ({ ...prev, mediaFiles: prev.mediaFiles.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const selectedAccount = accounts.find((acc) => acc._id === selectedAccountId);
    if (!selectedAccount || !selectedAccount.connected || selectedAccount.connectionHealthy === false) {
      setError("Please select a healthy, connected account.");
      return;
    }

    const maxLengths = { twitter: 280, instagram: 2200, facebook: 63206, linkedin: 3000 };
    const maxLength = maxLengths[platform] || 63206;
    if (newPost.content.length > maxLength) {
      setError(`Content exceeds ${maxLength} character limit for ${platformNames[platform]}`);
      return;
    }

    if (platform === 'instagram' && (!newPost.mediaFiles || newPost.mediaFiles.length === 0)) {
      setError("Instagram posts require at least one image or video");
      return;
    }

    const scheduledDate = new Date(`${newPost.date}T${newPost.time}`);
    if (scheduledDate <= new Date()) {
      setError("Scheduled date must be in the future");
      return;
    }

    try {
      setLoading(true);
      const postData = {
        accountId: selectedAccountId,
        content: newPost.content.trim(),
        mediaFiles: newPost.mediaFiles,
        scheduledDate: scheduledDate.toISOString(),
        platform: selectedAccount.platform.toLowerCase(),
      };

      const response = await axios.post("/api/scheduler", postData);
      const createdPost = response.data;

      setScheduledPosts((prev) => [createdPost, ...prev]);
      setNewPost({ content: "", date: "", time: "", mediaFiles: [], accountId: selectedAccountId });
      setShowModal(false);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to schedule post");
    } finally {
      setLoading(false);
    }
  };

  const deletePost = async (postId) => {
    if (!window.confirm("Are you sure you want to delete this scheduled post?")) return;

    try {
      setLoading(true);
      await axios.delete(`/api/scheduler/${postId}`);
      setScheduledPosts((prev) => prev.filter((post) => post._id !== postId));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to delete post");
    } finally {
      setLoading(false);
    }
  };

  const retryPost = async (postId) => {
    try {
      setLoading(true);
      const response = await axios.post(`/api/scheduler/${postId}/retry`);
      const updatedPost = response.data;
      
      setScheduledPosts((prev) => 
        prev.map(post => post._id === postId ? updatedPost : post)
      );
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to retry post");
    } finally {
      setLoading(false);
    }
  };

  const triggerScheduler = async () => {
    try {
      setRefreshingStats(true);
      await axios.post("/api/scheduler/trigger");
      await Promise.all([loadPosts(), loadSchedulerStats()]);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to trigger scheduler");
    } finally {
      setRefreshingStats(false);
    }
  };

  const toggleScheduler = async (action) => {
    try {
      setRefreshingStats(true);
      await axios.post(`/api/scheduler/${action}`);
      await loadSchedulerStats();
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} scheduler`);
    } finally {
      setRefreshingStats(false);
    }
  };

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  };

  const MediaPreview = ({ media, index, onRemove }) => (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-gray-200">
          {media.resourceType === 'video' ? (
            <div className="w-full h-full flex items-center justify-center">
              <Video size={20} className="text-blue-500" />
            </div>
          ) : (
            <img 
              src={media.thumbnails?.[0]?.url || media.url}
              alt={media.originalName} 
              className="w-full h-full object-cover" 
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {media.originalName}
          </p>
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <span>{media.format?.toUpperCase()}</span>
            <span>•</span>
            <span>{formatFileSize(media.bytes)}</span>
            {media.width && media.height && (
              <>
                <span>•</span>
                <span>{media.width}×{media.height}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="flex-shrink-0 p-1 text-red-400 hover:text-red-600"
        title="Remove file"
      >
        <X size={16} />
      </button>
    </div>
  );

  const StorageUsageIndicator = () => {
    if (!uploadConfig?.userStorage) return null;

    const { used, limit } = uploadConfig.userStorage;
    const percentage = (used / limit) * 100;

    return (
      <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
        <div className="flex justify-between items-center mb-1">
          <span className="text-gray-600">Storage Used</span>
          <span className={percentage > 80 ? 'text-red-600' : 'text-gray-800'}>
            {used.toFixed(1)} / {limit}MB
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1">
          <div 
            className={`h-1 rounded-full transition-all ${
              percentage > 90 ? 'bg-red-500' : 
              percentage > 75 ? 'bg-yellow-500' : 
              'bg-blue-500'
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
    );
  };

  // Early returns
  if (!isAuthenticated) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center">
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-gray-500">Please log in to access the post scheduler.</p>
        </div>
      </div>
    );
  }

  if (loading && scheduledPosts.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Post Scheduler</h1>
          <p className="text-gray-600">
            Schedule posts for <span className="font-medium">{platformNames[platform]}</span>
            {schedulerStats && (
              <span className="ml-2 text-sm">
                • <span className={schedulerStats.schedulerActive ? "text-green-600" : "text-red-600"}>
                  {schedulerStats.schedulerActive ? "Active" : "Inactive"}
                </span>
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowStatsModal(true)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center"
          >
            <Activity size={18} className="mr-1" />
            Stats
          </button>
          <button
            onClick={() => setShowModal(true)}
            disabled={healthyAccounts.length === 0}
            className={`px-4 py-2 rounded-lg flex items-center disabled:opacity-50 disabled:cursor-not-allowed
              ${
                platform === "twitter"
                  ? "bg-blue-500 hover:bg-blue-600"
                  : platform === "instagram"
                  ? "bg-pink-500 hover:bg-pink-600"
                  : "bg-indigo-500 hover:bg-indigo-600"
              } text-white`}
          >
            <Plus size={18} className="mr-1" />
            New Post
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <AlertCircle size={20} className="text-red-500 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-800">{error}</p>
              <button onClick={() => setError(null)} className="text-sm text-red-600 underline mt-1">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {availableAccounts.length > 0 && healthyAccounts.length === 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle size={20} className="text-yellow-500 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-800 font-medium">Account Connection Issues</p>
              <p className="text-yellow-700 text-sm mt-1">
                All {platformNames[platform]} accounts have connection issues. Please check your account settings and reconnect if necessary.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <div>
            <h2 className="font-medium">Scheduled Posts</h2>
            {pagination.total > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                Showing {Math.min(pagination.offset + scheduledPosts.length, pagination.total)} of {pagination.total} posts
              </p>
            )}
          </div>
          <button
            onClick={loadPosts}
            className="p-2 text-gray-500 hover:text-gray-700"
            title="Refresh posts"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="divide-y divide-gray-200">
          {scheduledPosts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CalendarIcon size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No posts scheduled for {platformNames[platform]}</p>
            </div>
          ) : (
            scheduledPosts.map((post) => {
              const { date, time } = formatDateTime(post.scheduledDate);
              const account = accounts.find(acc => acc._id === post.accountId);
              
              return (
                <div key={post._id} className="p-4 flex items-start">
                  <div className="mr-4 flex flex-col items-center">
                    {platformIcons[post.platform?.toLowerCase()]}
                    <div className="mt-1">{getStatusIcon(post)}</div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 mr-4">
                        <p className="text-gray-800 mb-2">{post.content}</p>
                        {post.mediaFiles?.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {post.mediaFiles.slice(0, 4).map((media, index) => (
                              <div key={index} className="relative rounded-lg overflow-hidden w-16 h-16 bg-gray-100">
                                {media.resourceType === 'video' ? (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Video size={24} className="text-blue-500" />
                                  </div>
                                ) : (
                                  <img 
                                    src={media.url} 
                                    alt={media.originalName || `Media ${index + 1}`} 
                                    className="w-full h-full object-cover" 
                                  />
                                )}
                                <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-opacity" />
                              </div>
                            ))}
                            {post.mediaFiles.length > 4 && (
                              <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                                +{post.mediaFiles.length - 4}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center text-sm text-gray-500 flex-wrap gap-2">
                          <span className="flex items-center">
                            <CalendarIcon size={14} className="mr-1" />
                            {date}
                          </span>
                          <span className="flex items-center">
                            <Clock size={14} className="mr-1" />
                            {time}
                          </span>
                          {account && (
                            <span className="flex items-center text-xs bg-gray-100 px-2 py-1 rounded">
                              {getAccountHealthIcon(account)}
                              <span className="ml-1">@{account.username || "Unknown"}</span>
                            </span>
                          )}
                          {post.externalPostId && (
                            <span className="flex items-center text-xs text-green-600">
                              <ExternalLink size={12} className="mr-1" />
                              Published
                            </span>
                          )}
                        </div>
                        {post.status === 'failed' && post.publishError && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                            <strong>Error:</strong> {post.publishError}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-1">
                        {post.status === 'failed' && (
                          <button
                            onClick={() => retryPost(post._id)}
                            className="p-2 text-gray-400 hover:text-blue-500"
                            title="Retry failed post"
                            disabled={loading}
                          >
                            <RefreshCw size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => deletePost(post._id)}
                          className="p-2 text-gray-400 hover:text-red-500"
                          title="Delete scheduled post"
                          disabled={loading}
                        >
                          <TrashIcon size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Schedule New Post</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
                <select
                  className="w-full border border-gray-300 rounded-lg p-2"
                  value={selectedAccountId}
                  onChange={(e) => {
                    setSelectedAccountId(e.target.value);
                    setNewPost((prev) => ({ ...prev, accountId: e.target.value }));
                  }}
                  required
                >
                  <option value="">Select an account</option>
                  {availableAccounts.map((account) => (
                    <option 
                      key={account._id} 
                      value={account._id}
                      disabled={!account.connected || account.connectionHealthy === false}
                    >
                      {account.username || account.displayName} ({account.platform})
                      {!account.connected && " - Disconnected"}
                      {account.connectionHealthy === false && " - Connection Issues"}
                    </option>
                  ))}
                </select>
                {selectedAccountId && accounts.find(acc => acc._id === selectedAccountId)?.syncError && (
                  <p className="text-xs text-yellow-600 mt-1">
                    ⚠️ {accounts.find(acc => acc._id === selectedAccountId)?.syncError}
                  </p>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg p-2"
                  rows={4}
                  value={newPost.content}
                  onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                  placeholder={`What's happening on ${platformNames[platform]}?`}
                  required
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>
                    {newPost.content.length}/
                    {platform === "twitter" ? "280" : platform === "instagram" ? "2200" : "63206"} characters
                  </span>
                  {platform === 'instagram' && (
                    <span className="text-yellow-600">📷 Instagram requires media</span>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Media {platform === 'instagram' && <span className="text-red-500">*</span>}
                </label>
                
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-gray-400 transition-colors">
                  <input
                    type="file"
                    id="media-upload"
                    multiple
                    accept="image/*,video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={uploadingMedia}
                  />
                  <label
                    htmlFor="media-upload"
                    className="cursor-pointer flex flex-col items-center justify-center text-gray-500 hover:text-gray-700"
                  >
                    <Upload size={24} className="mb-2" />
                    <span className="text-sm font-medium">
                      {uploadingMedia ? 'Uploading...' : 'Click to upload media'}
                    </span>
                    <span className="text-xs mt-1">
                      Images and videos supported (max 50MB per file)
                    </span>
                  </label>
                </div>

                {uploadingMedia && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {newPost.mediaFiles.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Uploaded Media ({newPost.mediaFiles.length})
                      </span>
                      <span className="text-xs text-gray-500">
                        {platform === 'twitter' && 'Max 4 files'}
                        {platform === 'instagram' && 'Max 10 files'}
                        {platform === 'facebook' && 'Max 10 files'}
                        {platform === 'linkedin' && 'Max 1 file'}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {newPost.mediaFiles.map((media, index) => (
                        <MediaPreview key={index} media={media} index={index} onRemove={removeMediaFile} />
                      ))}
                    </div>
                  </div>
                )}

                {platform === 'instagram' && newPost.mediaFiles.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    Instagram requires at least one image or video
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 rounded-lg p-2"
                    value={newPost.date}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setNewPost({ ...newPost, date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                  <input
                    type="time"
                    className="w-full border border-gray-300 rounded-lg p-2"
                    value={newPost.time}
                    onChange={(e) => setNewPost({ ...newPost, time: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setError(null);
                    setNewPost({ 
                      content: "", 
                      date: "", 
                      time: "", 
                      mediaFiles: [], 
                      accountId: selectedAccountId 
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={loading || uploadingMedia}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || uploadingMedia || !selectedAccountId}
                  className={`px-4 py-2 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center
                    ${
                      platform === "twitter"
                        ? "bg-blue-500 hover:bg-blue-600"
                        : platform === "instagram"
                        ? "bg-pink-500 hover:bg-pink-600"
                        : "bg-indigo-500 hover:bg-indigo-600"
                    }`}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Scheduling...
                    </>
                  ) : uploadingMedia ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Uploading...
                    </>
                  ) : (
                    "Schedule Post"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showStatsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Scheduler Statistics</h2>
              <div className="flex gap-2">
                <button
                  onClick={loadSchedulerStats}
                  disabled={refreshingStats}
                  className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  <RefreshCw size={18} className={refreshingStats ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => setShowStatsModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>

            {schedulerStats ? (
              <div className="space-y-6">
                <div className="flex gap-2 p-4 bg-gray-50 rounded-lg">
                  <button
                    onClick={() => toggleScheduler(schedulerStats.schedulerActive ? 'stop' : 'start')}
                    disabled={refreshingStats}
                    className={`px-4 py-2 rounded-lg text-white flex items-center disabled:opacity-50 ${
                      schedulerStats.schedulerActive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                    }`}
                  >
                    {schedulerStats.schedulerActive ? <PauseCircle size={18} className="mr-1" /> : <PlayCircle size={18} className="mr-1" />}
                    {schedulerStats.schedulerActive ? 'Stop' : 'Start'} Scheduler
                  </button>
                  <button
                    onClick={triggerScheduler}
                    disabled={refreshingStats}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center disabled:opacity-50"
                  >
                    <Zap size={18} className="mr-1" />
                    Trigger Now
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-600">Total Runs</p>
                    <p className="text-2xl font-bold text-blue-800">{schedulerStats.totalRuns}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-600">Published</p>
                    <p className="text-2xl font-bold text-green-800">{schedulerStats.postsPublished}</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-600">Failed</p>
                    <p className="text-2xl font-bold text-red-800">{schedulerStats.postsFailed}</p>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-yellow-600">Success Rate</p>
                    <p className="text-2xl font-bold text-yellow-800">{schedulerStats.successRate}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Rate Limits</p>
                    <p className="text-xl font-semibold">{schedulerStats.rateLimitErrors}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Auth Errors</p>
                    <p className="text-xl font-semibold">{schedulerStats.tokenExpiredErrors}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Network Errors</p>
                    <p className="text-xl font-semibold">{schedulerStats.networkErrors}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Duplicate Content</p>
                    <p className="text-xl font-semibold">{schedulerStats.duplicateContentErrors}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Policy Violations</p>
                    <p className="text-xl font-semibold">{schedulerStats.contentPolicyErrors}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Connection Issues</p>
                    <p className="text-xl font-semibold">{schedulerStats.connectionErrors}</p>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold mb-2">Scheduler Status</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Status: </span>
                      <span className={schedulerStats.schedulerActive ? "text-green-600" : "text-red-600"}>
                        {schedulerStats.schedulerActive ? "Running" : "Stopped"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Cache Size: </span>
                      <span>{schedulerStats.cacheSize} connections cached</span>
                    </div>
                    {schedulerStats.lastRunTime && (
                      <div className="col-span-2">
                        <span className="text-gray-600">Last Run: </span>
                        <span>{new Date(schedulerStats.lastRunTime).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {publishingReport && (
                  <div>
                    <h3 className="font-semibold mb-3">Publishing Report ({publishingReport.timeframe})</h3>
                    
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-2xl font-bold text-green-800">{publishingReport.summary.published}</p>
                        <p className="text-sm text-green-600">Published</p>
                      </div>
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <p className="text-2xl font-bold text-red-800">{publishingReport.summary.failed}</p>
                        <p className="text-sm text-red-600">Failed</p>
                      </div>
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-800">{publishingReport.summary.scheduled}</p>
                        <p className="text-sm text-blue-600">Scheduled</p>
                      </div>
                    </div>

                    {publishingReport.failed?.length > 0 && (
                      <div className="mb-4">
                        <h4 className="font-medium mb-2 text-red-700">Recent Failures</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {publishingReport.failed.slice(0, 5).map((post, index) => (
                            <div key={index} className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                              <div className="flex justify-between items-start">
                                <div className="flex-1 mr-2">
                                  <p className="text-red-800 font-medium">{post.platform} - @{post.username}</p>
                                  <p className="text-red-700 text-xs mt-1">{post.content}</p>
                                  <p className="text-red-600 text-xs mt-1">{post.error}</p>
                                </div>
                                <span className="text-xs text-red-500">
                                  {new Date(post.failedAt).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {publishingReport.upcoming?.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 text-blue-700">Upcoming Posts</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {publishingReport.upcoming.slice(0, 5).map((post, index) => (
                            <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                              <div className="flex justify-between items-start">
                                <div className="flex-1 mr-2">
                                  <p className="text-blue-800 font-medium">{post.platform} - @{post.username}</p>
                                  <p className="text-blue-700 text-xs mt-1">{post.content}</p>
                                </div>
                                <span className="text-xs text-blue-500">
                                  {new Date(post.scheduledDate).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-gray-600">Loading scheduler statistics...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Scheduler;
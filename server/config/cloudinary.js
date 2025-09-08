const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Single upload preset configuration for all platforms
const UPLOAD_CONFIG = {
  preset: 'social_grow', // Your single upload preset
  resource_type: 'auto',
  format: 'auto',
  quality: 'auto:good',
  flags: 'progressive'
};

// Platform-specific folder configurations
const PLATFORM_FOLDERS = {
  twitter: 'social-scheduler/twitter',
  instagram: 'social-scheduler/instagram',
  facebook: 'social-scheduler/facebook',
  linkedin: 'social-scheduler/linkedin'
};

// Helper function to get upload options for a specific platform
const getUploadOptions = (platform) => {
  return {
    ...UPLOAD_CONFIG,
    folder: PLATFORM_FOLDERS[platform] || 'social-scheduler/general'
  };
};

// Upload function with simplified preset usage
const uploadImage = async (filePath, platform = 'general') => {
  try {
    const uploadOptions = getUploadOptions(platform);
    
    const result = await cloudinary.uploader.upload(filePath, {
      upload_preset: uploadOptions.preset,
      folder: uploadOptions.folder,
      resource_type: uploadOptions.resource_type,
      format: uploadOptions.format,
      quality: uploadOptions.quality,
      flags: uploadOptions.flags
    });

    return {
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Upload multiple images
const uploadMultipleImages = async (filePaths, platform = 'general') => {
  try {
    const uploadPromises = filePaths.map(filePath => uploadImage(filePath, platform));
    const results = await Promise.all(uploadPromises);
    
    return {
      success: true,
      results: results
    };
  } catch (error) {
    console.error('Multiple upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Delete image function
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return {
      success: result.result === 'ok',
      result: result.result
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get optimized URL for different transformations
const getOptimizedUrl = (publicId, options = {}) => {
  const {
    width,
    height,
    crop = 'fill',
    quality = 'auto:good',
    format = 'auto'
  } = options;

  return cloudinary.url(publicId, {
    width,
    height,
    crop,
    quality,
    format,
    secure: true
  });
};

module.exports = {
  cloudinary,
  UPLOAD_CONFIG,
  PLATFORM_FOLDERS,
  getUploadOptions,
  uploadImage,
  uploadMultipleImages,
  deleteImage,
  getOptimizedUrl
};
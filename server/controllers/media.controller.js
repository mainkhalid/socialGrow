const multer = require('multer');
const { cloudinary, UPLOAD_CONFIG, PLATFORM_FOLDERS, getUploadOptions } = require('../config/cloudinary');
const User = require('../models/user.model');

// Configure multer for file upload with size limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/mov',
      'video/avi',
      'video/webm',
      'video/quicktime'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'), false);
    }
  }
});

// Platform-specific file validations
const validateFileForPlatform = (file, platform) => {
  const maxSizes = {
    twitter: {
      image: 5 * 1024 * 1024,
      video: 512 * 1024 * 1024
    },
    instagram: {
      image: 8 * 1024 * 1024,
      video: 100 * 1024 * 1024
    },
    facebook: {
      image: 4 * 1024 * 1024,
      video: 1024 * 1024 * 1024
    },
    linkedin: {
      image: 20 * 1024 * 1024,
      video: 200 * 1024 * 1024
    }
  };

  const platformLimits = maxSizes[platform?.toLowerCase()];
  if (!platformLimits) {
    return { valid: false, message: 'Unsupported platform' };
  }

  const isVideo = file.mimetype.startsWith('video/');
  const maxSize = isVideo ? platformLimits.video : platformLimits.image;

  if (file.size > maxSize) {
    const sizeLimit = (maxSize / (1024 * 1024)).toFixed(0);
    const fileType = isVideo ? 'video' : 'image';
    return {
      valid: false,
      message: `${fileType} files for ${platform} must be under ${sizeLimit}MB`
    };
  }

  return { valid: true };
};

// **FIXED: Rewritten to use a more robust upload method and better error handling**
const uploadMedia = async (req, res) => {
  try {
    const { platform } = req.body;

    if (!platform) {
      return res.status(400).json({
        message: 'Platform is required'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        message: 'No files provided'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const maxFiles = {
      twitter: 4,
      instagram: 10,
      facebook: 10,
      linkedin: 1
    };

    const maxFileCount = maxFiles[platform?.toLowerCase()] || 1;

    if (req.files.length > maxFileCount) {
      return res.status(400).json({
        message: `${platform} allows maximum ${maxFileCount} files per upload`
      });
    }

    const uploadOptions = getUploadOptions(platform);
    const uploadResults = [];
    const errors = [];

    // Use Promise.all to handle parallel uploads for better performance
    const uploadPromises = req.files.map(async (file) => {
      try {
        const validation = validateFileForPlatform(file, platform);
        if (!validation.valid) {
          throw new Error(validation.message);
        }

        const isVideo = file.mimetype.startsWith('video/');
        const resourceType = isVideo ? 'video' : 'image';

        // Direct upload using the file buffer
        const uploadResult = await cloudinary.uploader.upload(
          `data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
            upload_preset: uploadOptions.preset,
            folder: `${uploadOptions.folder}/${req.user.userId}`,
            resource_type: resourceType,
            quality: uploadOptions.quality || 'auto:good',
            flags: uploadOptions.flags,
            transformation: isVideo ? [] : [
              { width: 2048, height: 2048, crop: 'limit' },
              { quality: 'auto:good' }
            ],
            context: {
              userId: req.user.userId,
              platform: platform,
              uploadedAt: new Date().toISOString()
            },
            eager: !isVideo ? [
              { width: 400, height: 400, crop: 'fill', quality: 'auto:good' },
              { width: 800, height: 600, crop: 'fill', quality: 'auto:good' }
            ] : undefined
          }
        );

        // Return the full result object for processing later
        return {
          success: true,
          data: {
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            resourceType: uploadResult.resource_type,
            format: uploadResult.format,
            width: uploadResult.width,
            height: uploadResult.height,
            bytes: uploadResult.bytes,
            originalName: file.originalname,
            createdAt: uploadResult.created_at,
            platform: platform,
            thumbnails: uploadResult.eager ? uploadResult.eager.map(t => ({
              url: t.secure_url,
              width: t.width,
              height: t.height
            })) : []
          }
        };

      } catch (error) {
        console.error(`Upload failed for file ${file.originalname}:`, error);
        return {
          success: false,
          error: {
            file: file.originalname,
            message: error.message || 'Upload failed'
          }
        };
      }
    });

    const results = await Promise.all(uploadPromises);

    results.forEach(result => {
      if (result.success) {
        uploadResults.push(result.data);
        const fileSizeMB = result.data.bytes / (1024 * 1024);
        user.storageUsed = (user.storageUsed || 0) + fileSizeMB;
      } else {
        errors.push(result.error);
      }
    });

    await user.save();

    const response = {
      success: uploadResults.length > 0,
      message: `${uploadResults.length} file(s) uploaded successfully`,
      files: uploadResults,
      errors: errors.length > 0 ? errors : undefined,
      storageUsed: user.storageUsed
    };

    res.json(response);

  } catch (error) {
    console.error('Media upload error:', error);
    res.status(500).json({
      message: 'Upload failed',
      error: error.message
    });
  }
};

// Get upload configuration for frontend
const getUploadConfig = async (req, res) => {
  try {
    const { platform } = req.query;

    if (!platform) {
      return res.status(400).json({
        message: 'Platform parameter is required'
      });
    }

    if (!PLATFORM_FOLDERS[platform?.toLowerCase()]) {
      return res.status(400).json({
        message: 'Unsupported platform'
      });
    }

    const user = await User.findById(req.user.userId);
    const uploadOptions = getUploadOptions(platform);

    res.json({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      uploadPreset: uploadOptions.preset,
      folder: uploadOptions.folder,
      maxFileSize: {
        twitter: { image: 5, video: 512 },
        instagram: { image: 8, video: 100 },
        facebook: { image: 4, video: 1024 },
        linkedin: { image: 20, video: 200 }
      },
      maxFiles: {
        twitter: 4,
        instagram: 10,
        facebook: 10,
        linkedin: 1
      },
      supportedFormats: {
        image: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        video: ['mp4', 'mov', 'avi', 'webm']
      },
      userStorage: {
        used: user?.storageUsed || 0,
        limit: user?.storageLimit || 1000
      }
    });
  } catch (error) {
    console.error('Get upload config error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete media from Cloudinary and update user storage
const deleteMedia = async (req, res) => {
  try {
    const { publicId, resourceType = 'image' } = req.body;

    if (!publicId) {
      return res.status(400).json({
        message: 'Public ID is required'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete from Cloudinary and get deletion info
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });

    if (result.result === 'ok') {
      const fileBytes = result.bytes;
      if (fileBytes > 0) {
        const fileSizeMB = fileBytes / (1024 * 1024);
        user.storageUsed = Math.max(0, (user.storageUsed || 0) - fileSizeMB);
        await user.save();
      }

      res.json({
        success: true,
        message: 'Media deleted successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to delete media'
      });
    }
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user's uploaded media
const getUserMedia = async (req, res) => {
  try {
    const { platform, limit = 20, nextCursor } = req.query;

    let searchExpression = `context.userId:${req.user.userId}`;
    if (platform) {
      searchExpression += ` AND context.platform:${platform}`;
    }

    const result = await cloudinary.search
      .expression(searchExpression)
      .sort_by([['uploaded_at', 'desc']])
      .max_results(parseInt(limit))
      .next_cursor(nextCursor)
      .execute();

    const media = result.resources.map(resource => ({
      publicId: resource.public_id,
      url: resource.secure_url,
      resourceType: resource.resource_type,
      format: resource.format,
      width: resource.width,
      height: resource.height,
      bytes: resource.bytes,
      createdAt: resource.created_at,
      platform: resource.context?.platform,
      folder: resource.folder
    }));

    res.json({
      success: true,
      media,
      nextCursor: result.next_cursor,
      totalCount: result.total_count
    });

  } catch (error) {
    console.error('Get user media error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  upload,
  uploadMedia,
  getUploadConfig,
  deleteMedia,
  getUserMedia
};
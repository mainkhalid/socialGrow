const express = require('express');
const router = express.Router();
const { 
  upload,
  uploadMedia, 
  getUploadConfig, 
  deleteMedia 
} = require('../controllers/media.controller');
const { cloudinary } = require('../config/cloudinary'); // Moved this require to the top

// Upload media files
router.post('/upload', upload.array('files', 10), uploadMedia);

// Get upload configuration for platform
router.get('/config', getUploadConfig);

// Delete media from Cloudinary
router.delete('/', deleteMedia);

// Bulk delete media
router.delete('/bulk', async (req, res) => {
  try {
    const { publicIds } = req.body;
    
    if (!Array.isArray(publicIds) || publicIds.length === 0) {
      return res.status(400).json({ 
        message: 'publicIds array is required' 
      });
    }

    // Delete multiple resources
    const deleteResults = await Promise.allSettled(
      publicIds.map(publicId => 
        cloudinary.uploader.destroy(publicId, { resource_type: 'auto' })
      )
    );

    const successful = deleteResults.filter(r => r.status === 'fulfilled' && r.value.result === 'ok').length;
    const failed = deleteResults.length - successful;

    res.json({
      success: true,
      message: `Deleted ${successful} files successfully, ${failed} failed`,
      successful,
      failed
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
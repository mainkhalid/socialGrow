const mongoose = require('mongoose');
const postSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    platform: {
      type: String,
      enum: ['twitter', 'instagram', 'facebook'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    mediaUrls: [String],
    scheduledDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'published', 'failed'],
      default: 'scheduled',
    },
    analytics: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
      engagementRate: { type: Number, default: 0 },
    },
    externalPostId: {
      type: String,
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);
const Post = mongoose.model('Post', postSchema);
module.exports = Post;
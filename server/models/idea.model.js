const mongoose = require('mongoose');
const ideaSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    platform: {
      type: String,
      enum: ['twitter', 'instagram', 'facebook'],
      required: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    generatedText: {
      type: String,
      required: true,
    },
    liked: {
      type: Boolean,
      default: false,
    },
    disliked: {
      type: Boolean,
      default: false,
    },
    convertedToPost: {
      type: Boolean,
      default: false,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
    },
  },
  {
    timestamps: true,
  }
);
const Idea = mongoose.model('Idea', ideaSchema);
module.exports = Idea;
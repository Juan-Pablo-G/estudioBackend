const mongoose = require('mongoose')

const postSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Por defecto la publicación es privada; el usuario puede marcarla como pública.
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    imagePublicId: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model('Post', postSchema)


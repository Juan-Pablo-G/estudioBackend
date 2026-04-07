const express = require('express')
const multer = require('multer')
const cloudinary = require('cloudinary').v2
const Post = require('../models/Post')
const auth = require('../middleware/auth')

const router = express.Router()

// Configuración de Multer para memoria (para subir a Cloudinary)
const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
})

// GET /api/posts -> lista de mis posts (más recientes primero)
router.get('/', auth, async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.user.id }).sort({ createdAt: -1 })
    res.json(posts)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al obtener los posts' })
  }
})

// GET /api/posts/public -> feed público (no requiere autenticación)
router.get('/public', async (req, res) => {
  try {
    const posts = await Post.find({ isPublic: true }).sort({ createdAt: -1 })
    res.json(posts)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al obtener el feed público' })
  }
})

// POST /api/posts -> crear post nuevo con imagen
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, description } = req.body
    const isPublic =
      req.body.isPublic === 'true' || req.body.isPublic === '1' || req.body.isPublic === 1

    if (!title || !req.file) {
      return res
        .status(400)
        .json({ message: 'El título y la imagen son obligatorios' })
    }

    // Subir imagen a Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'posts' },
        (error, result) => {
          if (error) reject(error)
          else resolve(result)
        }
      )
      stream.end(req.file.buffer)
    })

    const imageUrl = result.secure_url
    const imagePublicId = result.public_id

    const post = await Post.create({
      userId: req.user.id,
      title,
      description,
      imageUrl,
      imagePublicId,
      isPublic,
    })

    res.status(201).json(post)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al crear el post' })
  }
})

// DELETE /api/posts/:id -> eliminar post
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params

    const post = await Post.findById(id)

    if (!post) {
      return res.status(404).json({ message: 'Publicación no encontrada' })
    }

    if (post.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permiso para eliminar esta publicación' })
    }

    // Borrar la imagen en Cloudinary si tenemos el public_id
    if (post.imagePublicId) {
      try {
        await cloudinary.uploader.destroy(post.imagePublicId)
      } catch (cloudError) {
        console.error('Error al borrar la imagen en Cloudinary:', cloudError)
      }
    }

    await post.deleteOne()

    res.json({ message: 'Publicación eliminada correctamente' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al eliminar la publicación' })
  }
})

module.exports = router


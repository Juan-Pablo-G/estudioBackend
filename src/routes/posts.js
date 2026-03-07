const path = require('path')
const fs = require('fs')
const express = require('express')
const multer = require('multer')
const Post = require('../models/Post')

const router = express.Router()

// Configuración de Multer para guardar imágenes en /uploads
const uploadsDir = path.join(__dirname, '..', '..', 'uploads')

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
})

// GET /api/posts -> lista de posts (más recientes primero)
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 })
    res.json(posts)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al obtener los posts' })
  }
})

// POST /api/posts -> crear post nuevo con imagen
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, description } = req.body

    if (!title || !req.file) {
      return res
        .status(400)
        .json({ message: 'El título y la imagen son obligatorios' })
    }

    const imageUrl = `/uploads/${req.file.filename}`

    const post = await Post.create({
      title,
      description,
      imageUrl,
    })

    res.status(201).json(post)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al crear el post' })
  }
})

// DELETE /api/posts/:id -> eliminar post y su imagen asociada
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const post = await Post.findById(id)

    if (!post) {
      return res.status(404).json({ message: 'Publicación no encontrada' })
    }

    // Borrar archivo de imagen si existe
    if (post.imageUrl) {
      const filePath = path.join(
        uploadsDir,
        path.basename(post.imageUrl),
      )

      fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
          console.error('Error al borrar la imagen:', err)
        }
      })
    }

    await post.deleteOne()

    res.json({ message: 'Publicación eliminada correctamente' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al eliminar la publicación' })
  }
})

module.exports = router


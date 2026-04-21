const express = require('express')
const multer = require('multer')
const cloudinary = require('cloudinary').v2
const auth = require('../middleware/auth')
const { query } = require('../db')

const router = express.Router()

// Configuración de Multer para memoria (para subir a Cloudinary)
const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
})

function mapPost(row) {
  return {
    _id: String(row.id),
    userId: String(row.user_id),
    isPublic: row.is_public,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    imagePublicId: row.image_public_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// GET /api/posts -> lista de mis posts (más recientes primero)
router.get('/', auth, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT *
        FROM posts
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [req.user.id],
    )
    res.json(result.rows.map(mapPost))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al obtener los posts' })
  }
})

// GET /api/posts/public -> feed público (no requiere autenticación)
router.get('/public', async (req, res) => {
  try {
    const result = await query(
      `
        SELECT *
        FROM posts
        WHERE is_public = TRUE
        ORDER BY created_at DESC
      `,
    )
    res.json(result.rows.map(mapPost))
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

    const insertResult = await query(
      `
        INSERT INTO posts (user_id, is_public, title, description, image_url, image_public_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        req.user.id,
        isPublic,
        title,
        description || null,
        result.secure_url,
        result.public_id || null,
      ],
    )

    res.status(201).json(mapPost(insertResult.rows[0]))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al crear el post' })
  }
})

// DELETE /api/posts/:id -> eliminar post
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params

    const postResult = await query('SELECT * FROM posts WHERE id = $1 LIMIT 1', [id])
    const post = postResult.rows[0]

    if (!post) {
      return res.status(404).json({ message: 'Publicación no encontrada' })
    }

    if (String(post.user_id) !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permiso para eliminar esta publicación' })
    }

    // Borrar la imagen en Cloudinary si tenemos el public_id
    if (post.image_public_id) {
      try {
        await cloudinary.uploader.destroy(post.image_public_id)
      } catch (cloudError) {
        console.error('Error al borrar la imagen en Cloudinary:', cloudError)
      }
    }

    await query('DELETE FROM posts WHERE id = $1', [id])

    res.json({ message: 'Publicación eliminada correctamente' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al eliminar la publicación' })
  }
})

// PATCH /api/posts/:id -> editar post propio
router.patch('/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params
    const { title, description } = req.body
    const postResult = await query('SELECT * FROM posts WHERE id = $1 LIMIT 1', [id])
    const post = postResult.rows[0]

    if (!post) {
      return res.status(404).json({ message: 'Publicación no encontrada' })
    }

    if (String(post.user_id) !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permiso para editar esta publicación' })
    }

    const isPublic = req.body.isPublic == null
      ? post.is_public
      : req.body.isPublic === 'true' || req.body.isPublic === '1' || req.body.isPublic === 1
    let nextImageUrl = post.image_url
    let nextImagePublicId = post.image_public_id

    if (req.file) {
      // Subir nueva imagen a Cloudinary
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

      if (post.image_public_id) {
        try {
          await cloudinary.uploader.destroy(post.image_public_id)
        } catch (cloudError) {
          console.error('Error al borrar la imagen anterior en Cloudinary:', cloudError)
        }
      }

      nextImageUrl = result.secure_url
      nextImagePublicId = result.public_id
    }
    const updatedResult = await query(
      `
        UPDATE posts
        SET
          title = $2,
          description = $3,
          is_public = $4,
          image_url = $5,
          image_public_id = $6,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        id,
        typeof title !== 'undefined' ? title : post.title,
        typeof description !== 'undefined' ? description : post.description,
        isPublic,
        nextImageUrl,
        nextImagePublicId,
      ],
    )

    res.json(mapPost(updatedResult.rows[0]))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al actualizar el post' })
  }
})

module.exports = router

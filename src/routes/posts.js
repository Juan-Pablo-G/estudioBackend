const express = require('express')
const multer = require('multer')
const cloudinary = require('cloudinary').v2
const auth = require('../middleware/auth')
const { optionalAuth } = require('../middleware/auth')
const { query } = require('../db')
const { notifyPostOwnerAboutLike } = require('../services/likeNotifications')

const router = express.Router()

// Configuracion de Multer para memoria (para subir a Cloudinary)
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
    likesCount: Number(row.likes_count || 0),
    likedByMe: Boolean(row.liked_by_me),
  }
}

function inferDisplayNameFromEmail(email) {
  if (!email) return 'Alguien'

  const [localPart] = String(email).split('@')
  if (!localPart) return 'Alguien'

  return localPart
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

// GET /api/posts -> lista de mis posts (mas recientes primero)
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

// GET /api/posts/public -> feed publico (no requiere autenticacion)
router.get('/public', optionalAuth, async (req, res) => {
  try {
    const currentUserId = req.user?.id ? Number(req.user.id) : null
    const result = await query(
      `
        SELECT
          posts.*,
          COUNT(post_likes.id)::INT AS likes_count,
          COALESCE(BOOL_OR(post_likes.user_id = $1), FALSE) AS liked_by_me
        FROM posts
        LEFT JOIN post_likes ON post_likes.post_id = posts.id
        WHERE is_public = TRUE
        GROUP BY posts.id
        ORDER BY created_at DESC
      `,
      [currentUserId],
    )
    res.json(result.rows.map(mapPost))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al obtener el feed publico' })
  }
})

// POST /api/posts/:id/like -> dar o quitar like a un post publico
router.post('/:id/like', auth, async (req, res) => {
  try {
    const { id } = req.params

    const postResult = await query(
      `
        SELECT
          posts.id,
          posts.user_id,
          posts.title,
          posts.description,
          owners.email AS owner_email,
          likers.email AS liker_email
        FROM posts
        INNER JOIN users AS owners ON owners.id = posts.user_id
        INNER JOIN users AS likers ON likers.id = $2
        WHERE posts.id = $1 AND posts.is_public = TRUE
        LIMIT 1
      `,
      [id, req.user.id],
    )

    const post = postResult.rows[0]

    if (!post) {
      return res.status(404).json({ message: 'Publicacion publica no encontrada' })
    }

    const existingLikeResult = await query(
      `
        SELECT id
        FROM post_likes
        WHERE post_id = $1 AND user_id = $2
        LIMIT 1
      `,
      [id, req.user.id],
    )

    let likedByMe = false
    let didCreateLike = false

    if (existingLikeResult.rows[0]) {
      await query(
        `
          DELETE FROM post_likes
          WHERE post_id = $1 AND user_id = $2
        `,
        [id, req.user.id],
      )
    } else {
      await query(
        `
          INSERT INTO post_likes (post_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT (post_id, user_id) DO NOTHING
        `,
        [id, req.user.id],
      )
      likedByMe = true
      didCreateLike = true
    }

    if (didCreateLike && String(post.user_id) !== String(req.user.id)) {
      try {
        await notifyPostOwnerAboutLike({
          ownerEmail: post.owner_email,
          ownerName: inferDisplayNameFromEmail(post.owner_email),
          likerName: inferDisplayNameFromEmail(post.liker_email),
          postTitle: post.title,
          postDescription: post.description,
        })
      } catch (notificationError) {
        console.error('Error al enviar la notificacion de like por MailerSend:', notificationError)
      }
    }

    const likesResult = await query(
      `
        SELECT COUNT(*)::INT AS likes_count
        FROM post_likes
        WHERE post_id = $1
      `,
      [id],
    )

    res.json({
      _id: String(id),
      likesCount: Number(likesResult.rows[0]?.likes_count || 0),
      likedByMe,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al actualizar el like' })
  }
})

// POST /api/posts -> crear post nuevo con imagen
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, description } = req.body
    const isPublic =
      req.body.isPublic === 'true' || req.body.isPublic === '1' || req.body.isPublic === 1

    if (!title || !req.file) {
      return res.status(400).json({ message: 'El titulo y la imagen son obligatorios' })
    }

    // Subir imagen a Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: 'posts' }, (error, uploadResult) => {
        if (error) reject(error)
        else resolve(uploadResult)
      })
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
      return res.status(404).json({ message: 'Publicacion no encontrada' })
    }

    if (String(post.user_id) !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permiso para eliminar esta publicacion' })
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

    res.json({ message: 'Publicacion eliminada correctamente' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al eliminar la publicacion' })
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
      return res.status(404).json({ message: 'Publicacion no encontrada' })
    }

    if (String(post.user_id) !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permiso para editar esta publicacion' })
    }

    const isPublic =
      req.body.isPublic == null
        ? post.is_public
        : req.body.isPublic === 'true' || req.body.isPublic === '1' || req.body.isPublic === 1

    let nextImageUrl = post.image_url
    let nextImagePublicId = post.image_public_id

    if (req.file) {
      // Subir nueva imagen a Cloudinary
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: 'posts' }, (error, uploadResult) => {
          if (error) reject(error)
          else resolve(uploadResult)
        })
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

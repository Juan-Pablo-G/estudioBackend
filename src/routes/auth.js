const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { query } = require('../db')

const router = express.Router()

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  )
}

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son obligatorios' })
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' })
    }

    const normalizedEmail = String(email).toLowerCase()
    const existsResult = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [
      normalizedEmail,
    ])
    if (existsResult.rows[0]) {
      return res.status(409).json({ message: 'Este email ya está registrado' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const userResult = await query(
      `
        INSERT INTO users (email, password_hash)
        VALUES ($1, $2)
        RETURNING id, email
      `,
      [normalizedEmail, passwordHash],
    )

    const user = userResult.rows[0]
    const token = signToken(user)
    return res.status(201).json({ token, user: { id: String(user.id), email: user.email } })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Error al registrar' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son obligatorios' })
    }

    const userResult = await query(
      `
        SELECT id, email, password_hash
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [String(email).toLowerCase()],
    )
    const user = userResult.rows[0]
    if (!user) return res.status(401).json({ message: 'Credenciales inválidas' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' })

    const token = signToken(user)
    return res.json({ token, user: { id: String(user.id), email: user.email } })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Error al iniciar sesión' })
  }
})

module.exports = router

const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')

const router = express.Router()

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
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

    const exists = await User.findOne({ email: String(email).toLowerCase() })
    if (exists) {
      return res.status(409).json({ message: 'Este email ya está registrado' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      email: String(email).toLowerCase(),
      passwordHash,
    })

    const token = signToken(user)
    return res.status(201).json({ token, user: { id: user._id, email: user.email } })
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

    const user = await User.findOne({ email: String(email).toLowerCase() })
    if (!user) return res.status(401).json({ message: 'Credenciales inválidas' })

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' })

    const token = signToken(user)
    return res.json({ token, user: { id: user._id, email: user.email } })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Error al iniciar sesión' })
  }
})

module.exports = router


const path = require('path')
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const morgan = require('morgan')
const dotenv = require('dotenv')
const cloudinary = require('cloudinary').v2

dotenv.config()

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const postsRouter = require('./src/routes/posts')
const authRouter = require('./src/routes/auth')

const app = express()

const PORT = process.env.PORT || 4000
const MONGODB_URI =
  process.env.MONGODB_URI
const JWT_SECRET = process.env.JWT_SECRET

// Middlewares
app.use(cors({ origin: '*' }))
app.use(express.json())
app.use(morgan('dev'))

// Archivos estáticos de imágenes subidas (remover si no se necesita)
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Rutas API
app.use('/api/auth', authRouter)
app.use('/api/posts', postsRouter)

// Conexión a MongoDB y arranque del servidor
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    if (!JWT_SECRET) {
      console.error('Falta JWT_SECRET en .env')
      process.exit(1)
    }
    console.log('Conectado a MongoDB')
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Error al conectar a MongoDB', err)
    process.exit(1)
  })


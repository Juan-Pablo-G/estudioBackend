const path = require('path')
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const morgan = require('morgan')
const dotenv = require('dotenv')

dotenv.config()

const postsRouter = require('./src/routes/posts')

const app = express()

const PORT = process.env.PORT || 4000
const MONGODB_URI =
  process.env.MONGODB_URI

// Middlewares
app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())
app.use(morgan('dev'))

// Archivos estáticos de imágenes subidas
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Rutas API
app.use('/api/posts', postsRouter)

// Conexión a MongoDB y arranque del servidor
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('Conectado a MongoDB')
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Error al conectar a MongoDB', err)
    process.exit(1)
  })


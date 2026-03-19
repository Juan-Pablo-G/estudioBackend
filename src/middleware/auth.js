const jwt = require('jsonwebtoken')

function getTokenFromRequest(req) {
  const header = req.get('authorization') || ''
  const [type, token] = header.split(' ')
  if (type !== 'Bearer' || !token) return null
  return token
}

module.exports = function auth(req, res, next) {
  const token = getTokenFromRequest(req)
  if (!token) return res.status(401).json({ message: 'No autenticado' })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { id: payload.sub, email: payload.email }
    return next()
  } catch {
    return res.status(401).json({ message: 'Token inválido' })
  }
}


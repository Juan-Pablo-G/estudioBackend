const jwt = require('jsonwebtoken')

function getTokenFromRequest(req) {
  const header = req.get('authorization') || ''
  const [type, token] = header.split(' ')
  if (type !== 'Bearer' || !token) return null
  return token
}

function attachUserFromToken(req) {
  const token = getTokenFromRequest(req)
  if (!token) return false

  const payload = jwt.verify(token, process.env.JWT_SECRET)
  req.user = { id: payload.sub, email: payload.email }
  return true
}

function auth(req, res, next) {
  const token = getTokenFromRequest(req)
  if (!token) return res.status(401).json({ message: 'No autenticado' })

  try {
    attachUserFromToken(req)
    return next()
  } catch {
    return res.status(401).json({ message: 'Token invÃ¡lido' })
  }
}

function optionalAuth(req, _res, next) {
  const token = getTokenFromRequest(req)
  if (!token) return next()

  try {
    attachUserFromToken(req)
  } catch {
    req.user = null
  }

  return next()
}

module.exports = auth
module.exports.getTokenFromRequest = getTokenFromRequest
module.exports.optionalAuth = optionalAuth

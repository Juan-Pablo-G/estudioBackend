const { sendEmail } = require('./mailersend')

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function truncateText(value, maxLength = 140) {
  if (!value) return ''

  const normalizedValue = String(value).trim()
  if (normalizedValue.length <= maxLength) return normalizedValue

  return `${normalizedValue.slice(0, maxLength - 3)}...`
}

function getPostLabel(postTitle, postDescription) {
  return truncateText(postTitle || postDescription || 'Tu publicacion')
}

async function notifyPostOwnerAboutLike({
  ownerEmail,
  ownerName,
  likerName,
  postTitle,
  postDescription,
}) {
  if (!ownerEmail) {
    return { skipped: true, reason: 'missing_owner_email' }
  }

  const safeOwnerName = ownerName || 'hola'
  const safeLikerName = likerName || 'Alguien'
  const postLabel = getPostLabel(postTitle, postDescription)
  const subject = 'Alguien le dio like a tu publicacion'
  const text =
    `Hola ${safeOwnerName}, tu publicacion "${postLabel}" ha recibido un nuevo like de ${safeLikerName}. ` +
    'Sigue compartiendo contenido increible.'
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
      <h2 style="margin-bottom: 16px;">Alguien le dio like a tu publicacion</h2>
      <p>Hola ${escapeHtml(safeOwnerName)},</p>
      <p>
        Tu publicacion <strong>${escapeHtml(postLabel)}</strong> ha recibido un nuevo like de
        <strong>${escapeHtml(safeLikerName)}</strong>.
      </p>
      <p>Sigue compartiendo contenido increible.</p>
    </div>
  `.trim()

  return sendEmail({
    to: [{ email: ownerEmail, name: safeOwnerName }],
    subject,
    text,
    html,
  })
}

module.exports = {
  notifyPostOwnerAboutLike,
}

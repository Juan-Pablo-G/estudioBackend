const https = require('https')

const DEFAULT_API_URL = 'https://api.mailersend.com/v1/email'

let missingConfigWarningShown = false

function getMailerSendConfig() {
  return {
    enabled: process.env.MAILERSEND_ENABLED !== 'false',
    apiKey: process.env.MAILERSEND_API_KEY,
    apiUrl: process.env.MAILERSEND_API_URL || DEFAULT_API_URL,
    fromEmail: process.env.MAILERSEND_FROM_EMAIL,
    fromName: process.env.MAILERSEND_FROM_NAME || 'WebPinterest',
    replyToEmail: process.env.MAILERSEND_REPLY_TO_EMAIL || null,
    replyToName:
      process.env.MAILERSEND_REPLY_TO_NAME || process.env.MAILERSEND_FROM_NAME || 'WebPinterest',
  }
}

function logMissingConfigWarning() {
  if (missingConfigWarningShown) return

  missingConfigWarningShown = true
  console.warn(
    'MailerSend no esta configurado completamente. Define MAILERSEND_API_KEY y MAILERSEND_FROM_EMAIL para habilitar notificaciones por email.',
  )
}

function doRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, options, (response) => {
      let responseBody = ''

      response.on('data', (chunk) => {
        responseBody += chunk
      })

      response.on('end', () => {
        const ok = response.statusCode >= 200 && response.statusCode < 300
        if (ok) {
          return resolve({
            statusCode: response.statusCode,
            body: responseBody,
          })
        }

        return reject(
          new Error(
            `MailerSend respondio con ${response.statusCode}: ${responseBody || 'sin detalle'}`,
          ),
        )
      })
    })

    request.on('error', reject)
    request.write(body)
    request.end()
  })
}

async function sendEmail({ to, subject, text, html }) {
  const config = getMailerSendConfig()

  if (!config.enabled) return { skipped: true, reason: 'disabled' }

  if (!config.apiKey || !config.fromEmail) {
    logMissingConfigWarning()
    return { skipped: true, reason: 'missing_config' }
  }

  const payload = {
    from: {
      email: config.fromEmail,
      name: config.fromName,
    },
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html,
  }

  if (config.replyToEmail) {
    payload.reply_to = {
      email: config.replyToEmail,
      name: config.replyToName,
    }
  }

  const body = JSON.stringify(payload)
  const url = new URL(config.apiUrl)

  return doRequest(
    url,
    {
      method: 'POST',
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      port: url.port || 443,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
  )
}

module.exports = {
  getMailerSendConfig,
  sendEmail,
}

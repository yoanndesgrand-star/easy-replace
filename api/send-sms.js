const BREVO_URL = 'https://api.brevo.com/v3/transactionalSMS/send'
const PHONE_PATTERN = /^\d{10,15}$/

function json(response, status, body) {
  response.status(status).json(body)
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return json(response, 405, { error: 'Méthode non autorisée.' })
  }

  const { replacementId, recipients, message } = request.body || {}
  if (!replacementId || !Array.isArray(recipients) || recipients.length === 0 || typeof message !== 'string' || !message.trim()) {
    return json(response, 400, { error: 'replacementId, recipients et message sont requis.' })
  }
  if (recipients.length > 250) return json(response, 400, { error: 'Maximum 250 destinataires par envoi.' })
  if (message.length > 480) return json(response, 400, { error: 'Le message ne doit pas dépasser 480 caractères.' })

  const valid = recipients.map((recipient) => ({
    ...recipient,
    phone: String(recipient.phone || '').replace(/\D/g, ''),
  }))
  const invalid = valid.filter((recipient) => !recipient.id || !PHONE_PATTERN.test(recipient.phone))
  if (invalid.length) {
    return json(response, 400, { error: 'Un ou plusieurs destinataires sont invalides.', invalidRecipientIds: invalid.map((item) => item.id || null) })
  }

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    const details = valid.map((recipient) => ({
      id: recipient.id, phone: recipient.phone, success: true,
      messageId: `simulation-${replacementId}-${recipient.id}`,
    }))
    return json(response, 200, { simulated: true, sent: details.length, failed: 0, details })
  }

  const details = await Promise.all(valid.map(async (recipient) => {
    try {
      const brevoResponse = await fetch(BREVO_URL, {
        method: 'POST',
        headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: 'EasyReplace',
          recipient: recipient.phone,
          content: message,
          type: 'transactional',
          tag: 'easy-replace',
        }),
      })
      const data = await brevoResponse.json().catch(() => ({}))
      if (!brevoResponse.ok) throw new Error(data.message || `Brevo HTTP ${brevoResponse.status}`)
      return { id: recipient.id, phone: recipient.phone, success: true, messageId: data.messageId || data.reference || null }
    } catch (error) {
      return { id: recipient.id, phone: recipient.phone, success: false, error: error.message }
    }
  }))
  const sent = details.filter((item) => item.success).length
  return json(response, 200, { simulated: false, sent, failed: details.length - sent, details })
}

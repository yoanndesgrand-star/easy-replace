const BREVO_URL = 'https://api.brevo.com/v3/transactionalSMS/send'
const FRENCH_MOBILE_PATTERN = /^33[67]\d{8}$/
const MAX_RECIPIENTS = 250
const MAX_MESSAGE_LENGTH = 480

function json(response, status, body) {
  return response.status(status).json(body)
}

function normalizeFrenchPhone(value) {
  let phone = String(value || '').trim().replace(/[\s.\-()]/g, '')
  if (phone.startsWith('+')) phone = phone.slice(1)
  if (phone.startsWith('00')) phone = phone.slice(2)
  if (/^0[67]\d{8}$/.test(phone)) phone = `33${phone.slice(1)}`
  return phone
}

function maskPhone(phone) {
  return phone.length > 4 ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : '**'
}

function safeBrevoDetails(status, data) {
  return {
    status,
    code: typeof data?.code === 'string' ? data.code : null,
    message: typeof data?.message === 'string' ? data.message : null,
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return json(response, 405, { success: false, error: 'Méthode non autorisée.', details: null })
  }

  const { replacementId, recipient, message, batchSize } = request.body || {}
  if (!replacementId) {
    return json(response, 400, { success: false, error: 'Identifiant de remplacement manquant.', details: null })
  }
  if (!recipient?.phone) {
    return json(response, 400, { success: false, error: 'Numéro de téléphone manquant.', details: null })
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_RECIPIENTS) {
    return json(response, 400, { success: false, error: `Le nombre de destinataires doit être compris entre 1 et ${MAX_RECIPIENTS}.`, details: null })
  }

  const cleanMessage = typeof message === 'string' ? message.trim() : ''
  if (!cleanMessage) {
    return json(response, 400, { success: false, error: 'Le message ne peut pas être vide.', details: null })
  }
  if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
    return json(response, 400, { success: false, error: `Le message ne doit pas dépasser ${MAX_MESSAGE_LENGTH} caractères.`, details: null })
  }

  const normalizedPhone = normalizeFrenchPhone(recipient.phone)
  if (!FRENCH_MOBILE_PATTERN.test(normalizedPhone)) {
    return json(response, 400, { success: false, error: 'Le numéro de téléphone français est invalide.', details: null })
  }

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.error('[Brevo] Configuration absente pour', maskPhone(normalizedPhone))
    return json(response, 500, { success: false, error: 'Le service SMS n’est pas configuré.', details: null })
  }

  try {
    const brevoResponse = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: 'EasyReplace',
        recipient: normalizedPhone,
        content: cleanMessage,
        type: 'transactional',
        tag: 'easy-replace',
      }),
    })
    const data = await brevoResponse.json().catch(() => ({}))
    const details = safeBrevoDetails(brevoResponse.status, data)

    console.info('[Brevo] Envoi vers', maskPhone(normalizedPhone), '— statut HTTP', brevoResponse.status)
    if (!brevoResponse.ok) {
      console.error('[Brevo] Erreur pour', maskPhone(normalizedPhone), '—', details.message || details.code || 'Réponse inconnue')
      return json(response, 502, {
        success: false,
        error: details.message || 'Brevo a refusé l’envoi du SMS.',
        details,
      })
    }

    return json(response, 200, {
      success: true,
      messageId: data.messageId || data.reference || null,
    })
  } catch (error) {
    console.error('[Brevo] Échec réseau pour', maskPhone(normalizedPhone), '—', error.message)
    return json(response, 502, {
      success: false,
      error: 'Impossible de contacter Brevo pour le moment.',
      details: { status: null, code: 'NETWORK_ERROR', message: error.message },
    })
  }
}

import { createClient } from '@supabase/supabase-js'

const BREVO_URL = 'https://api.brevo.com/v3/transactionalSMS/send'
const FRENCH_MOBILE_PATTERN = /^33[67]\d{8}$/
const MAX_RECIPIENTS = 250
const MAX_MESSAGE_LENGTH = 480

function json(response, status, body) { return response.status(status).json(body) }
function normalizeFrenchPhone(value) {
  let phone = String(value || '').trim().replace(/[\s.\-()]/g, '')
  if (phone.startsWith('+')) phone = phone.slice(1)
  if (phone.startsWith('00')) phone = phone.slice(2)
  if (/^0[67]\d{8}$/.test(phone)) phone = `33${phone.slice(1)}`
  return phone
}
function maskPhone(phone) { return phone.length > 4 ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : '**' }
function safeBrevoDetails(status, data) { return { status, code: typeof data?.code === 'string' ? data.code : null, message: typeof data?.message === 'string' ? data.message : null } }
function estimateSmsSegments(value) {
  const basic = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
  const extended = '^{}\\[~]|€'
  let gsmLength = 0
  let unicode = false
  for (const char of String(value || '')) {
    if (basic.includes(char)) gsmLength += 1
    else if (extended.includes(char)) gsmLength += 2
    else { unicode = true; break }
  }
  const length = unicode ? [...String(value || '')].length : gsmLength
  return Math.max(1, length <= (unicode ? 70 : 160) ? 1 : Math.ceil(length / (unicode ? 67 : 153)))
}
function getAuthorizedSupabase(request) {
  const authorization = request.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return null
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
}

export default async function handler(request, response) {
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return json(response, 405, { success: false, error: 'Méthode non autorisée.' }) }
  const { replacementId, recipient, message, batchSize, messageType = 'initial' } = request.body || {}
  if (!replacementId) return json(response, 400, { success: false, error: 'Identifiant de remplacement manquant.' })
  if (!recipient?.id || !recipient?.phone) return json(response, 400, { success: false, error: 'Destinataire incomplet.' })
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_RECIPIENTS) return json(response, 400, { success: false, error: `Le nombre de destinataires doit être compris entre 1 et ${MAX_RECIPIENTS}.` })
  const cleanMessage = typeof message === 'string' ? message.trim() : ''
  if (!cleanMessage) return json(response, 400, { success: false, error: 'Le message ne peut pas être vide.' })
  if (cleanMessage.length > MAX_MESSAGE_LENGTH) return json(response, 400, { success: false, error: `Le message ne doit pas dépasser ${MAX_MESSAGE_LENGTH} caractères.` })
  const normalizedPhone = normalizeFrenchPhone(recipient.phone)
  if (!FRENCH_MOBILE_PATTERN.test(normalizedPhone)) return json(response, 400, { success: false, error: 'Le numéro de téléphone français est invalide.' })

  const supabase = getAuthorizedSupabase(request)
  if (!supabase) return json(response, 401, { success: false, error: 'Session invalide. Reconnectez-vous.' })
  const segments = estimateSmsSegments(cleanMessage)
  const { data: usageId, error: reserveError } = await supabase.rpc('reserve_sms_send', {
    p_replacement_id: replacementId, p_recipient_id: recipient.id, p_message_type: messageType, p_segments: segments,
  })
  if (reserveError) return json(response, 402, { success: false, error: reserveError.message || 'Quota SMS insuffisant.', segments })

  const finalize = async (success, messageId, status, errorMessage) => {
    const { error } = await supabase.rpc('finalize_sms_send', {
      p_usage_id: usageId, p_success: success, p_provider_message_id: messageId || null,
      p_provider_status: status || null, p_error_message: errorMessage || null,
    })
    if (error) console.error('[Quota] Finalisation impossible', error.message)
  }

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) { await finalize(false, null, 500, 'Service SMS non configuré.'); return json(response, 500, { success: false, error: 'Le service SMS n’est pas configuré.' }) }
  try {
    const brevoResponse = await fetch(BREVO_URL, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': apiKey }, body: JSON.stringify({ sender: 'EasyReplace', recipient: normalizedPhone, content: cleanMessage, type: 'transactional', tag: `easy-replace-${messageType}` }) })
    const data = await brevoResponse.json().catch(() => ({}))
    const details = safeBrevoDetails(brevoResponse.status, data)
    if (!brevoResponse.ok) { await finalize(false, null, brevoResponse.status, details.message || details.code); return json(response, 502, { success: false, error: details.message || 'Brevo a refusé l’envoi du SMS.', details, segments }) }
    const messageId = data.messageId || data.reference || null
    await finalize(true, messageId, brevoResponse.status, null)
    console.info('[Brevo]', maskPhone(normalizedPhone), segments, 'segment(s)')
    return json(response, 200, { success: true, messageId, segments })
  } catch (error) {
    await finalize(false, null, null, error.message)
    return json(response, 502, { success: false, error: 'Impossible de contacter Brevo pour le moment.', details: { code: 'NETWORK_ERROR', message: error.message }, segments })
  }
}

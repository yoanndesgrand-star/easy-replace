import { supabase } from '../lib/supabase'

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Votre session a expiré. Reconnectez-vous.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
}

const selection = '*, replacement_recipients!replacement_recipients_replacement_id_fkey(*)'

export async function listReplacements() {
  // Répare et clôture les statuts côté base avant chaque lecture.
  // La fonction est idempotente : aucun changement si tout est déjà cohérent.
  const { error: syncError } = await supabase.rpc('synchronize_replacement_statuses')
  if (syncError && syncError.code !== 'PGRST202') throw syncError

  const { data, error } = await supabase.from('replacement_requests').select(selection).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createReplacement(form, coaches, message) {
  const { data: { user } } = await supabase.auth.getUser()
  const fields = {
    location_id: form.location_id || null, venue: form.venue, address: form.address || null,
    replacement_date: form.replacement_date, start_time: form.start_time, end_time: form.end_time,
    class_type: form.class_type, required_specialty: form.required_specialty,
    manager_name: form.manager_name, manager_phone: form.manager_phone,
  }
  const { data: request, error } = await supabase.from('replacement_requests')
    .insert({ ...fields, user_id: user.id, message, status: 'draft' }).select().single()
  if (error) throw error
  const recipients = coaches.map((coach) => ({
    replacement_id: request.id, coach_id: coach.id, phone_snapshot: coach.normalized_phone,
    coach_name_snapshot: `${coach.first_name} ${coach.last_name}`, sms_status: 'pending',
  }))
  const { data, error: recipientsError } = await supabase.from('replacement_recipients').insert(recipients).select()
  if (recipientsError) throw recipientsError
  return { request, recipients: data }
}

export async function sendReplacement(request, recipients) {
  if (!recipients.length) throw new Error('Sélectionnez au moins un destinataire.')
  if (recipients.length > 250) throw new Error('Maximum 250 destinataires par envoi.')

  const headers = await authHeaders()
  const details = await Promise.all(recipients.map(async (item) => {
    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          replacementId: request.id,
          recipient: { id: item.id, phone: item.phone_snapshot, name: item.coach_name_snapshot },
          message: `${request.message}\nRépondre : ${window.location.origin}/r/${item.response_token}`,
          batchSize: recipients.length,
          messageType: 'initial',
        }),
      })
      const result = await response.json().catch(() => ({ success: false, error: 'Réponse serveur invalide.' }))
      return {
        id: item.id,
        success: response.ok && result.success === true,
        messageId: result.messageId || null,
        error: response.ok && result.success === true ? null : result.error || 'Envoi impossible',
      }
    } catch {
      return { id: item.id, success: false, messageId: null, error: 'Impossible de contacter le service SMS.' }
    }
  }))

  await Promise.all(details.map((item) => supabase.from('replacement_recipients').update({
    sms_status: item.success ? 'sent' : 'failed',
    provider_message_id: item.messageId || null,
    error_message: item.error || null,
    sent_at: item.success ? new Date().toISOString() : null,
  }).eq('id', item.id)))
  await supabase.from('replacement_requests').update({ status: 'sent' }).eq('id', request.id)
  const sent = details.filter((item) => item.success).length
  return { success: sent === details.length, sent, failed: details.length - sent, details }
}

export async function remindPendingRecipients(request) {
  if (!request?.id) throw new Error('Remplacement introuvable.')
  if (request.status === 'filled' || request.accepted_recipient_id) {
    throw new Error('Ce remplacement est déjà pourvu.')
  }
  if (request.status === 'cancelled') throw new Error('Ce remplacement est annulé.')

  const recipients = (request.replacement_recipients || []).filter((item) =>
    !['accepted', 'declined', 'closed'].includes(item.response_status),
  )
  if (!recipients.length) throw new Error('Aucun coach en attente à relancer.')
  if (recipients.length > 250) throw new Error('Maximum 250 destinataires par relance.')

  const remindedAt = new Date().toISOString()
  const headers = await authHeaders()
  const details = await Promise.all(recipients.map(async (item) => {
    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          replacementId: request.id,
          recipient: { id: item.id, phone: item.phone_snapshot, name: item.coach_name_snapshot },
          message: `Rappel Easy Replace\n${request.message}\nRépondre : ${window.location.origin}/r/${item.response_token}`,
          batchSize: recipients.length,
          messageType: 'reminder',
        }),
      })
      const result = await response.json().catch(() => ({ success: false, error: 'Réponse serveur invalide.' }))
      return {
        recipient: item,
        success: response.ok && result.success === true,
        messageId: result.messageId || null,
        error: response.ok && result.success === true ? null : result.error || 'Envoi impossible',
      }
    } catch {
      return { recipient: item, success: false, messageId: null, error: 'Impossible de contacter le service SMS.' }
    }
  }))

  await Promise.all(details.map(({ recipient, success, messageId, error }) =>
    supabase.from('replacement_recipients').update({
      sms_status: success ? 'sent' : 'failed',
      provider_message_id: messageId || recipient.provider_message_id || null,
      error_message: error || null,
      reminder_count: (recipient.reminder_count || 0) + 1,
      last_reminded_at: remindedAt,
    }).eq('id', recipient.id),
  ))

  const sent = details.filter((item) => item.success).length
  return { success: sent === details.length, sent, failed: details.length - sent, total: details.length, details }
}

export async function updateReplacementStatus(id, status) {
  const { error } = await supabase.from('replacement_requests').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteReplacement(id) {
  const { error } = await supabase.from('replacement_requests').delete().eq('id', id)
  if (error) throw error
}

export async function updateReplacement(id, fields) {
  const allowed = ['location_id', 'venue', 'address', 'replacement_date', 'start_time', 'end_time', 'class_type', 'required_specialty', 'manager_name', 'manager_phone', 'message']
  const payload = Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(fields, key)).map((key) => [key, fields[key] || null]))
  const { data, error } = await supabase.from('replacement_requests').update(payload).eq('id', id).in('status', ['draft', 'sent']).is('accepted_recipient_id', null).is('archived_at', null).select(selection).single()
  if (error) throw error
  return data
}

export async function cancelReplacement(id) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('replacement_requests').update({ status: 'cancelled', cancelled_at: now }).eq('id', id).is('archived_at', null)
  if (error) throw error
  const { error: recipientsError } = await supabase.from('replacement_recipients').update({ response_status: 'closed' }).eq('replacement_id', id).eq('response_status', 'pending')
  if (recipientsError) throw recipientsError
}

export async function completeReplacement(id) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('replacement_requests').update({ status: 'completed', completed_at: now }).eq('id', id).is('archived_at', null)
  if (error) throw error
  const { error: recipientsError } = await supabase.from('replacement_recipients').update({ response_status: 'closed' }).eq('replacement_id', id).eq('response_status', 'pending')
  if (recipientsError) throw recipientsError
}

export async function archiveReplacement(id) {
  const { error } = await supabase.from('replacement_requests').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function restoreReplacement(id) {
  const { error } = await supabase.from('replacement_requests').update({ archived_at: null }).eq('id', id)
  if (error) throw error
}

export async function assignReplacementManually(request, coach) {
  if (!request?.id || !coach?.id) throw new Error('Sélectionnez un coach.')
  let recipient = (request.replacement_recipients || []).find((item) => item.coach_id === coach.id)
  if (!recipient) {
    const { data, error } = await supabase.from('replacement_recipients').insert({
      replacement_id: request.id,
      coach_id: coach.id,
      phone_snapshot: coach.normalized_phone,
      coach_name_snapshot: `${coach.first_name} ${coach.last_name}`,
      sms_status: 'pending',
      response_status: 'pending',
    }).select().single()
    if (error) throw error
    recipient = data
  }
  const now = new Date().toISOString()
  const { error } = await supabase.from('replacement_requests').update({
    status: 'filled', accepted_recipient_id: recipient.id, accepted_coach_id: coach.id,
    accepted_coach_name: `${coach.first_name} ${coach.last_name}`, accepted_at: now,
    assignment_source: 'manual', cancelled_at: null, completed_at: null,
  }).eq('id', request.id).in('status', ['draft', 'sent']).is('archived_at', null)
  if (error) throw error
  const { error: recipientsError } = await supabase.from('replacement_recipients').update({
    response_status: 'closed',
  }).eq('replacement_id', request.id).neq('id', recipient.id).eq('response_status', 'pending')
  if (recipientsError) throw recipientsError
  const { error: acceptedError } = await supabase.from('replacement_recipients').update({ response_status: 'accepted', responded_at: now }).eq('id', recipient.id)
  if (acceptedError) throw acceptedError
}

import { supabase } from '../lib/supabase'

const selection = '*, replacement_recipients!replacement_recipients_replacement_id_fkey(*)'

export async function listReplacements() {
  const { data, error } = await supabase.from('replacement_requests').select(selection).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createReplacement(form, coaches, message) {
  const { data: { user } } = await supabase.auth.getUser()
  const fields = {
    venue: form.venue, address: form.address || null,
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

  const details = await Promise.all(recipients.map(async (item) => {
    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replacementId: request.id,
          recipient: { id: item.id, phone: item.phone_snapshot, name: item.coach_name_snapshot },
          message: `${request.message}\nRépondre : ${window.location.origin}/r/${item.response_token}`,
          batchSize: recipients.length,
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
  const details = await Promise.all(recipients.map(async (item) => {
    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replacementId: request.id,
          recipient: { id: item.id, phone: item.phone_snapshot, name: item.coach_name_snapshot },
          message: `Rappel Easy Replace\n${request.message}\nRépondre : ${window.location.origin}/r/${item.response_token}`,
          batchSize: recipients.length,
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

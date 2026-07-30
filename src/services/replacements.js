import { supabase } from '../lib/supabase'

const selection = '*, replacement_recipients(*)'

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
  const response = await fetch('/api/send-sms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      replacementId: request.id, message: request.message,
      recipients: recipients.map((item) => ({ id: item.id, phone: item.phone_snapshot, name: item.coach_name_snapshot })),
    }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Envoi impossible')
  await Promise.all(result.details.map((item) => supabase.from('replacement_recipients').update({
    sms_status: item.success ? 'sent' : 'failed',
    provider_message_id: item.messageId || null,
    error_message: item.error || null,
    sent_at: item.success ? new Date().toISOString() : null,
  }).eq('id', item.id)))
  await supabase.from('replacement_requests').update({ status: 'sent' }).eq('id', request.id)
  return result
}

export async function updateReplacementStatus(id, status) {
  const { error } = await supabase.from('replacement_requests').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteReplacement(id) {
  const { error } = await supabase.from('replacement_requests').delete().eq('id', id)
  if (error) throw error
}

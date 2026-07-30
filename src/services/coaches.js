import { supabase } from '../lib/supabase'
import { normalizeFrenchPhone } from '../lib/format'

export async function listCoaches() {
  const { data, error } = await supabase.from('coaches').select('*').order('last_name')
  if (error) throw error
  return data
}

export async function saveCoach(coach) {
  const { data: { user } } = await supabase.auth.getUser()
  const payload = {
    user_id: user.id, first_name: coach.first_name, last_name: coach.last_name,
    phone: coach.phone, normalized_phone: normalizeFrenchPhone(coach.phone),
    email: coach.email || null, specialties: coach.specialties || [],
    location: coach.location || null, notes: coach.notes || null, is_active: coach.is_active,
  }
  const query = coach.id
    ? supabase.from('coaches').update(payload).eq('id', coach.id)
    : supabase.from('coaches').insert(payload)
  const { data, error } = await query.select().single()
  if (error) throw error
  return data
}

export async function setCoachActive(id, is_active) {
  const { error } = await supabase.from('coaches').update({ is_active }).eq('id', id)
  if (error) throw error
}

export async function deleteCoach(id) {
  const { error } = await supabase.from('coaches').delete().eq('id', id)
  if (error) throw error
}

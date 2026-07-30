import { supabase } from '../lib/supabase'
import { normalizeFrenchPhone } from '../lib/format'

export async function listCoaches() {
  const { data, error } = await supabase.from('coaches').select('*, coach_locations(location_id, is_primary)').order('last_name')
  if (error) throw error
  return (data || []).map((coach) => ({
    ...coach,
    location_ids: (coach.coach_locations || []).map((item) => item.location_id),
    primary_location_id: (coach.coach_locations || []).find((item) => item.is_primary)?.location_id || null,
  }))
}

export async function saveCoach(coach) {
  const { data: { user } } = await supabase.auth.getUser()
  const payload = {
    user_id: user.id, first_name: coach.first_name, last_name: coach.last_name,
    phone: coach.phone, normalized_phone: normalizeFrenchPhone(coach.phone),
    email: coach.email || null, specialties: coach.specialties || [],
    location: coach.location || null, notes: coach.notes || null, is_active: coach.is_active,
  }
  const query = coach.id ? supabase.from('coaches').update(payload).eq('id', coach.id) : supabase.from('coaches').insert(payload)
  const { data, error } = await query.select().single()
  if (error) throw error
  const ids = [...new Set(coach.location_ids || [])]
  const primaryId = ids.includes(coach.primary_location_id) ? coach.primary_location_id : ids[0] || null
  const { error: deleteError } = await supabase.from('coach_locations').delete().eq('coach_id', data.id)
  if (deleteError) throw deleteError
  if (ids.length) {
    const { error: linkError } = await supabase.from('coach_locations').insert(ids.map((location_id) => ({ coach_id: data.id, location_id, is_primary: location_id === primaryId })))
    if (linkError) throw linkError
  }
  return data
}

export async function setCoachActive(id, is_active) { const { error } = await supabase.from('coaches').update({ is_active }).eq('id', id); if (error) throw error }
export async function deleteCoach(id) { const { error } = await supabase.from('coaches').delete().eq('id', id); if (error) throw error }

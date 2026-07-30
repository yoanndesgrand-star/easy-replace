import { supabase } from '../lib/supabase'

export async function listLocations() {
  const { data, error } = await supabase.from('locations').select('*').order('name')
  if (error) throw error
  return data || []
}

export async function saveLocation(location) {
  const { data: { user } } = await supabase.auth.getUser()
  const payload = { user_id: user.id, name: location.name.trim(), address: (location.address || '').trim(), is_active: location.is_active !== false }
  const query = location.id ? supabase.from('locations').update(payload).eq('id', location.id) : supabase.from('locations').insert(payload)
  const { data, error } = await query.select().single()
  if (error) throw error
  return data
}

export async function setLocationActive(id, is_active) {
  const { error } = await supabase.from('locations').update({ is_active }).eq('id', id)
  if (error) throw error
}

export async function deleteLocation(id) {
  const { error } = await supabase.from('locations').delete().eq('id', id)
  if (error) throw error
}

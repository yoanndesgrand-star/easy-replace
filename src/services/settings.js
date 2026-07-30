import { supabase } from '../lib/supabase'

export const DEFAULT_SMS_TEMPLATE = 'Easy Replace — Remplacement disponible le {date} de {debut} à {fin} à {etablissement} pour un cours de {cours}. Contact : {responsable} au {telephone}. {commentaire}'

export const defaultSettings = {
  establishment_name: '',
  manager_name: '',
  phone: '',
  email: '',
  locations: [],
  sms_template: DEFAULT_SMS_TEMPLATE,
  urgency_hours: 24,
  logo_url: '',
  timezone: 'Europe/Paris',
}

export async function getSettings() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Session introuvable.')
  const { data, error } = await supabase.from('establishment_settings').select('*').maybeSingle()
  if (error) throw error
  return { ...defaultSettings, ...(data || {}), email: data?.email || user.email || '' }
}

export async function saveSettings(fields) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Session introuvable.')
  const payload = {
    user_id: user.id,
    establishment_name: fields.establishment_name.trim(),
    manager_name: fields.manager_name.trim(),
    phone: fields.phone.trim(),
    email: fields.email.trim(),
    locations: fields.locations,
    sms_template: fields.sms_template.trim() || DEFAULT_SMS_TEMPLATE,
    urgency_hours: Number(fields.urgency_hours),
    logo_url: fields.logo_url || null,
    timezone: fields.timezone,
  }
  const { data, error } = await supabase.from('establishment_settings').upsert(payload, { onConflict: 'organization_id' }).select().single()
  if (error) throw error
  return data
}

export async function uploadLogo(file) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Session introuvable.')
  if (!file.type.startsWith('image/')) throw new Error('Sélectionnez un fichier image.')
  if (file.size > 2 * 1024 * 1024) throw new Error('Le logo ne doit pas dépasser 2 Mo.')
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
  const { data: organizationId, error: organizationError } = await supabase.rpc('current_organization_id')
  if (organizationError || !organizationId) throw organizationError || new Error('Établissement introuvable.')
  const path = `${organizationId}/logo-${Date.now()}.${extension}`
  const { error } = await supabase.storage.from('establishment-logos').upload(path, file, { upsert: true, cacheControl: '3600' })
  if (error) throw error
  return supabase.storage.from('establishment-logos').getPublicUrl(path).data.publicUrl
}

import { supabase } from '../lib/supabase'

export async function getSubscriptionOverview() {
  const { data, error } = await supabase.rpc('get_subscription_overview')
  if (error) throw error
  return data?.[0] || null
}

export async function listSmsUsage(limit = 100) {
  const { data, error } = await supabase.from('sms_usage')
    .select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data || []
}

export async function listSubscriptionEvents(limit = 50) {
  const { data, error } = await supabase.from('subscription_events')
    .select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data || []
}

export function estimateSmsSegments(text) {
  const value = String(text || '')
  const basic = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
  const extended = '^{}\\[~]|€'
  let gsmLength = 0
  let unicode = false
  for (const char of value) {
    if (basic.includes(char)) gsmLength += 1
    else if (extended.includes(char)) gsmLength += 2
    else { unicode = true; break }
  }
  const length = unicode ? [...value].length : gsmLength
  const single = unicode ? 70 : 160
  const multipart = unicode ? 67 : 153
  return Math.max(1, length <= single ? 1 : Math.ceil(length / multipart))
}

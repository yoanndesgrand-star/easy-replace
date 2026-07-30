import { supabase } from '../lib/supabase'

export async function ensureOrganization() {
  const { data, error } = await supabase.rpc('ensure_my_organization')
  if (error) throw error
  return data
}

export async function getCurrentOrganization() {
  const { data, error } = await supabase
    .from('organization_users')
    .select('role, organizations(*)')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? { ...data.organizations, role: data.role } : null
}

export async function getCurrentSubscription() {
  const organization = await getCurrentOrganization()
  if (!organization) return null
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, subscription_plans(*)')
    .eq('organization_id', organization.id)
    .maybeSingle()
  if (error) throw error
  return data
}

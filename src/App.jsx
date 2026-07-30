import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import AppShell from './components/AppShell'
import AuthPage from './pages/AuthPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import CoachesPage from './pages/CoachesPage'
import ReplacementPage from './pages/ReplacementPage'
import ReplacementsPage from './pages/ReplacementsPage'
import ReplacementDetails from './pages/ReplacementDetails'
import ActivityPage from './pages/ActivityPage'
import SettingsPage from './pages/SettingsPage'
import LocationsPage from './pages/LocationsPage'
import EditReplacementPage from './pages/EditReplacementPage'
import CoachResponsePage from './pages/CoachResponsePage'
import * as coachService from './services/coaches'
import * as replacementService from './services/replacements'
import * as settingsService from './services/settings'
import * as locationService from './services/locations'
import * as organizationService from './services/organizations'

export default function App() {
  const publicToken = window.location.pathname.match(/^\/r\/([0-9a-f-]{36})\/?$/i)?.[1] || null
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(window.location.pathname === '/reset-password' || window.location.hash.includes('type=recovery'))
  const [page, setPage] = useState('dashboard')
  const [payload, setPayload] = useState(null)
  const [coaches, setCoaches] = useState([])
  const [replacements, setReplacements] = useState([])
  const [settings, setSettings] = useState(settingsService.defaultSettings)
  const [locations, setLocations] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (publicToken) { setLoading(false); return }
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      if (!recovery) setSession(data.session?.user?.email_confirmed_at ? data.session : null)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') { setRecovery(true); window.history.replaceState({}, '', '/reset-password') }
      else if (!recovery) setSession(nextSession?.user?.email_confirmed_at ? nextSession : null)
    })
    return () => listener.subscription.unsubscribe()
  }, [recovery, publicToken])

  async function reload() {
    try {
      await organizationService.ensureOrganization()
      const [locationData, requestData, settingsData] = await Promise.all([locationService.listLocations(), replacementService.listReplacements(), settingsService.getSettings()])
      const coachData = await coachService.listCoaches()
      setLocations(locationData); setCoaches(coachData); setReplacements(requestData); setSettings(settingsData)
    } catch (err) { setError(err.message) }
  }
  useEffect(() => { if (session && !recovery) reload() }, [session, recovery])

  useEffect(() => {
    if (!session || recovery || !supabase) return
    const channel = supabase.channel('replacement-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replacement_requests' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replacement_recipients' }, () => reload())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session, recovery])

  function navigate(next, data = null) { setPage(next); setPayload(data); window.scrollTo(0, 0) }
  async function saveCoach(value) { await coachService.saveCoach(value); await reload() }
  async function send(form, selected, message) {
    const { request, recipients } = await replacementService.createReplacement(form, selected, message)
    const result = await replacementService.sendReplacement({ ...request, message }, recipients)
    await reload(); navigate('replacements')
    window.setTimeout(() => window.alert(
      result.failed
        ? `${result.sent} SMS envoyé(s), ${result.failed} échec(s). Consultez les remplacements pour les détails.`
        : `${result.sent} SMS envoyé(s).`,
    ), 50)
  }

  if (!isSupabaseConfigured) return <div className="setup"><div className="brand"><span>ER</span><strong>Easy Replace</strong></div><h1>Configuration requise</h1><p>Copiez <code>.env.example</code> vers <code>.env.local</code>, puis renseignez l’URL et la clé publique anonyme Supabase.</p><p>Aucun secret Brevo n’est requis pour le mode test.</p></div>
  if (publicToken && isSupabaseConfigured) return <CoachResponsePage token={publicToken} />
  if (loading) return <div className="loader">Chargement d’Easy Replace…</div>
  if (recovery) return <ResetPasswordPage onComplete={() => { setRecovery(false); setSession(null) }} />
  if (!session) return <AuthPage />

  let content
  if (page === 'coaches') content = <CoachesPage coaches={coaches} replacements={replacements} locations={locations} onSave={saveCoach} onToggle={async (c) => { await coachService.setCoachActive(c.id, !c.is_active); reload() }} onArchive={async (id) => { await coachService.archiveCoach(id); reload() }} onRestore={async (id) => { await coachService.restoreCoach(id); reload() }} />
  else if (page === 'locations') content = <LocationsPage locations={locations} coaches={coaches} onSave={async (v) => { await locationService.saveLocation(v); await reload() }} onToggle={async (v) => { await locationService.setLocationActive(v.id, !v.is_active); await reload() }} onDelete={async (id) => { await locationService.deleteLocation(id); await reload() }} />
  else if (page === 'replacement') content = <ReplacementPage locations={locations} key={payload?.id || 'new'} coaches={coaches} settings={settings} duplicate={payload} clearDuplicate={() => setPayload(null)} onSend={send} />
  else if (page === 'replacements') content = <ReplacementsPage locations={locations} settings={settings} key={payload?.filter || 'all'} initialFilter={payload?.filter || 'all'} replacements={replacements} onDetails={(r) => navigate('details', r)} onDuplicate={(r) => navigate('replacement', r)} navigate={navigate} />
  else if (page === 'activity') content = <ActivityPage replacements={replacements} navigate={navigate} />
  else if (page === 'settings') content = <SettingsPage settings={settings} onSave={async (fields) => { const saved = await settingsService.saveSettings(fields); setSettings({ ...settingsService.defaultSettings, ...saved }) }} />
  else if (page === 'edit-replacement') content = <EditReplacementPage locations={locations} settings={settings} replacement={payload} onCancel={() => navigate('details', payload)} onSave={async (fields) => { await replacementService.updateReplacement(payload.id, fields); await reload(); navigate('details', { ...payload, ...fields }) }} />
  else if (page === 'details') content = <ReplacementDetails settings={settings} replacement={replacements.find((item) => item.id === payload?.id) || payload} coaches={coaches} onBack={() => navigate('replacements')} onDuplicate={(r) => navigate('replacement', r)} onEdit={(r) => navigate('edit-replacement', r)} onRemind={async (r) => { const result = await replacementService.remindPendingRecipients(r); await reload(); return result }} onCancel={async (r) => { await replacementService.cancelReplacement(r.id); await reload(); navigate('replacements') }} onComplete={async (r) => { await replacementService.completeReplacement(r.id); await reload(); navigate('replacements') }} onArchive={async (r) => { await replacementService.archiveReplacement(r.id); await reload(); navigate('replacements') }} onRestore={async (r) => { await replacementService.restoreReplacement(r.id); await reload(); navigate('replacements') }} onAssign={async (r, coach) => { await replacementService.assignReplacementManually(r, coach); await reload() }} />
  else content = <DashboardPage coaches={coaches} replacements={replacements} settings={settings} navigate={navigate} />
  return <AppShell page={page} settings={settings} navigate={navigate} onSignOut={() => supabase.auth.signOut()}>{error && <div className="global-error">{error}<button onClick={() => setError('')}>×</button></div>}{content}</AppShell>
}

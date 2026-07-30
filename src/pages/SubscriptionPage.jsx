import { useEffect, useState } from 'react'
import { getSubscriptionOverview, listSmsUsage, listSubscriptionEvents } from '../services/subscriptions'

const labels = { initial: 'Invitation', reminder: 'Relance', admin_notification: 'Notification', manual: 'Manuel' }
const statuses = { active: 'Actif', past_due: 'Paiement en attente', suspended: 'Suspendu', cancelled: 'Résilié' }

export default function SubscriptionPage({ overview: initialOverview, onReload }) {
  const [overview, setOverview] = useState(initialOverview)
  const [usage, setUsage] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true); setError('')
    try {
      const [next, sms, history] = await Promise.all([getSubscriptionOverview(), listSmsUsage(), listSubscriptionEvents()])
      setOverview(next); setUsage(sms); setEvents(history); onReload?.(next)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  if (loading && !overview) return <section className="page"><div className="card">Chargement de l’abonnement…</div></section>
  if (!overview) return <section className="page"><div className="notice error">{error || 'Abonnement introuvable.'}</div></section>

  const allowance = Number(overview.included_sms) + Number(overview.pack_segments)
  const used = Number(overview.used_segments)
  const remaining = Number(overview.remaining_segments)
  const percent = Math.min(100, Number(overview.usage_percent || 0))
  const renewal = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(overview.current_period_end))
  const price = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(overview.monthly_price_cents / 100)

  let alert = null
  if (remaining === 0) alert = ['error', 'Votre quota SMS est épuisé. Les nouveaux envois sont bloqués.']
  else if (percent >= 80) alert = ['warning', `Attention, il ne vous reste que ${remaining} segment(s) SMS.`]
  else if (percent >= 50) alert = ['info', 'Vous avez utilisé plus de la moitié de votre quota mensuel.']

  return <section className="page subscription-page">
    <header className="page-header"><div><p className="eyebrow">Compte</p><h1>Abonnement</h1><p>Consultez votre formule et votre consommation SMS réelle.</p></div><button className="button secondary" onClick={load}>Actualiser</button></header>
    {error && <div className="notice error">{error}</div>}
    {alert && <div className={`notice ${alert[0]}`}>{alert[1]}</div>}

    <div className="subscription-hero card">
      <div><span className="plan-label">Formule actuelle</span><h2>{overview.plan_name}</h2><p><strong>{price} HT</strong> / mois</p></div>
      <span className={`subscription-status ${overview.status}`}>{statuses[overview.status] || overview.status}</span>
    </div>

    <div className="subscription-stats">
      <article className="card"><small>SMS consommés</small><strong>{used}</strong><span>segment(s) facturable(s)</span></article>
      <article className="card"><small>SMS restants</small><strong>{remaining}</strong><span>sur {allowance} disponibles</span></article>
      <article className="card"><small>Prochaine échéance</small><strong className="date-value">{renewal}</strong><span>remise à zéro du forfait</span></article>
    </div>

    <div className="card usage-card"><div className="usage-heading"><div><h2>Consommation</h2><p>{used} / {allowance} segments utilisés</p></div><strong>{percent}%</strong></div><div className="usage-track"><span style={{ width: `${percent}%` }} /></div><p className="usage-note">Un message long ou contenant certains caractères peut utiliser plusieurs segments SMS.</p></div>

    <div className="subscription-columns">
      <section className="card"><div className="section-title"><div><h2>Historique SMS</h2><p>Derniers envois comptabilisés</p></div></div>
        {!usage.length ? <div className="empty">Aucun SMS comptabilisé.</div> : <div className="compact-list">{usage.slice(0, 20).map(item => <div key={item.id}><span><strong>{labels[item.message_type] || item.message_type}</strong><small>{new Date(item.created_at).toLocaleString('fr-FR')}</small></span><span><strong>{item.segment_count} segment(s)</strong><small className={item.status === 'failed' ? 'danger-text' : ''}>{item.status === 'sent' ? 'Envoyé' : item.status === 'failed' ? 'Échec — non décompté' : 'En cours'}</small></span></div>)}</div>}
      </section>
      <section className="card"><div className="section-title"><div><h2>Événements</h2><p>Historique de l’abonnement</p></div></div>
        {!events.length ? <div className="empty">Aucun événement.</div> : <div className="compact-list">{events.map(item => <div key={item.id}><span><strong>{item.description || item.event_type}</strong><small>{new Date(item.created_at).toLocaleString('fr-FR')}</small></span></div>)}</div>}
      </section>
    </div>

    <div className="card coming-actions"><div><h2>Gestion commerciale</h2><p>Le changement d’offre, les packs SMS et le paiement seront activés avec Stripe.</p></div><div><button className="button primary" disabled>Changer d’offre</button><button className="button secondary" disabled>Acheter un pack</button></div></div>
  </section>
}

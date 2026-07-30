import { useMemo, useState } from 'react'
import { formatDate } from '../lib/format'

function asDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function addEvent(events, value, event) {
  const date = asDate(value)
  if (!date) return
  events.push({ ...event, at: date })
}

function buildActivity(replacements) {
  const events = []

  replacements.forEach((replacement) => {
    const label = `${replacement.class_type} · ${replacement.venue}`
    const context = {
      replacement,
      replacementId: replacement.id,
      label,
      dateLabel: `${formatDate(replacement.replacement_date, { day: 'numeric', month: 'long' })} · ${replacement.start_time?.slice(0, 5) || '—'}`,
    }

    addEvent(events, replacement.created_at, {
      ...context,
      type: 'created',
      title: 'Remplacement créé',
      detail: label,
      actor: replacement.manager_name || 'Responsable',
    })

    if (replacement.status === 'filled' || replacement.accepted_recipient_id) {
      addEvent(events, replacement.accepted_at, {
        ...context,
        type: 'accepted',
        title: `${replacement.accepted_coach_name || 'Un coach'} a accepté`,
        detail: `Le remplacement est maintenant pourvu.`,
        actor: replacement.accepted_coach_name || 'Coach',
      })
    }

    if (replacement.status === 'cancelled') {
      addEvent(events, replacement.updated_at || replacement.created_at, {
        ...context,
        type: 'cancelled',
        title: 'Remplacement annulé',
        detail: label,
        actor: replacement.manager_name || 'Responsable',
      })
    }

    ;(replacement.replacement_recipients || []).forEach((recipient) => {
      const name = recipient.coach_name_snapshot || 'Coach'
      addEvent(events, recipient.sent_at, {
        ...context,
        type: recipient.sms_status === 'failed' ? 'failed' : 'sent',
        title: recipient.sms_status === 'failed' ? `Échec d’envoi à ${name}` : `SMS envoyé à ${name}`,
        detail: recipient.error_message || label,
        actor: name,
      })
      addEvent(events, recipient.opened_at, {
        ...context,
        type: 'opened',
        title: `${name} a ouvert le lien`,
        detail: label,
        actor: name,
      })
      addEvent(events, recipient.responded_at, {
        ...context,
        type: recipient.response_status === 'accepted' ? 'accepted' : recipient.response_status === 'declined' ? 'declined' : 'response',
        title: recipient.response_status === 'accepted' ? `${name} a accepté` : recipient.response_status === 'declined' ? `${name} a refusé` : `${name} a répondu`,
        detail: label,
        actor: name,
      })
      addEvent(events, recipient.last_reminded_at, {
        ...context,
        type: 'reminded',
        title: `Relance envoyée à ${name}`,
        detail: `${recipient.reminder_count || 1} relance${(recipient.reminder_count || 1) > 1 ? 's' : ''} au total`,
        actor: name,
      })
    })
  })

  return events.sort((a, b) => b.at.getTime() - a.at.getTime())
}

function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

function dayTitle(date) {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(date) === dayKey(today)) return 'Aujourd’hui'
  if (dayKey(date) === dayKey(yesterday)) return 'Hier'
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const filters = [
  ['all', 'Toute l’activité'],
  ['responses', 'Réponses'],
  ['messages', 'SMS et relances'],
  ['requests', 'Demandes'],
]

function matchesFilter(event, filter) {
  if (filter === 'responses') return ['accepted', 'declined', 'opened', 'response'].includes(event.type)
  if (filter === 'messages') return ['sent', 'failed', 'reminded'].includes(event.type)
  if (filter === 'requests') return ['created', 'cancelled'].includes(event.type)
  return true
}

export default function ActivityPage({ replacements, navigate }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const events = useMemo(() => buildActivity(replacements), [replacements])
  const visible = events.filter((event) => {
    const normalizedQuery = query.trim().toLowerCase()
    const matchesQuery = !normalizedQuery || `${event.title} ${event.detail} ${event.actor} ${event.label}`.toLowerCase().includes(normalizedQuery)
    return matchesFilter(event, filter) && matchesQuery
  })
  const groups = visible.reduce((result, event) => {
    const key = dayKey(event.at)
    if (!result[key]) result[key] = []
    result[key].push(event)
    return result
  }, {})

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Journal opérationnel</p><h1>Activité</h1><p>Retrouvez les envois, ouvertures, réponses et attributions au même endroit.</p></div></header>

    <section className="activity-toolbar card">
      <label className="activity-search"><span>Rechercher</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Coach, salle, cours…" /></label>
      <div className="filter-pills">{filters.map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div>
    </section>

    {Object.keys(groups).length ? <div className="activity-groups">{Object.entries(groups).map(([key, group]) => <section className="activity-day" key={key}>
      <h2>{dayTitle(group[0].at)}</h2>
      <div className="activity-feed">{group.map((event, index) => <button className={`activity-item ${event.type}`} key={`${event.replacementId}-${event.type}-${event.at.toISOString()}-${index}`} onClick={() => navigate('details', event.replacement)}>
        <span className="activity-icon" aria-hidden="true">{event.type === 'accepted' ? '✓' : event.type === 'declined' ? '×' : event.type === 'opened' ? '◉' : event.type === 'reminded' ? '↻' : event.type === 'failed' ? '!' : event.type === 'sent' ? '→' : event.type === 'cancelled' ? '—' : '+'}</span>
        <span className="activity-content"><strong>{event.title}</strong><small>{event.detail}</small><em>{event.dateLabel}</em></span>
        <time>{event.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>
      </button>)}</div>
    </section>)}</div> : <div className="card empty"><strong>Aucune activité trouvée</strong><p>Modifiez votre recherche ou votre filtre.</p></div>}
  </div>
}

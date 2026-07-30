import { useMemo, useState } from 'react'
import { formatDate } from '../lib/format'
import { categoryLabels, getReplacementCategory } from '../lib/replacementView'

const filters = ['all', 'urgent', 'open', 'filled', 'completed']

function ReplacementCard({ replacement, category, onDetails, onDuplicate }) {
  const recipients = replacement.replacement_recipients || []
  const responses = recipients.filter((recipient) => ['accepted', 'declined'].includes(recipient.response_status)).length
  const accepted = replacement.accepted_coach_name || recipients.find((recipient) => recipient.response_status === 'accepted')?.coach_name_snapshot

  return <article className={`replacement-card replacement-card-${category}`}>
    <div className="replacement-card-top">
      <span className={`category-pill ${category}`}>{categoryLabels[category]}</span>
      <span className="replacement-date">{formatDate(replacement.replacement_date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
    </div>
    <h3>{replacement.class_type}</h3>
    <p className="replacement-venue">{replacement.venue}</p>
    <p className="replacement-time">{replacement.start_time?.slice(0, 5)} → {replacement.end_time?.slice(0, 5)}</p>
    <div className="replacement-metrics">
      <span><strong>{recipients.length}</strong><small>contacté{recipients.length > 1 ? 's' : ''}</small></span>
      <span><strong>{responses}</strong><small>réponse{responses > 1 ? 's' : ''}</small></span>
    </div>
    {accepted && <div className="accepted-coach"><span>✓</span><p><small>Accepté par</small><strong>{accepted}</strong></p></div>}
    <footer>
      <button className="button secondary" onClick={() => onDuplicate(replacement)}>Dupliquer</button>
      <button className="button primary" onClick={() => onDetails(replacement)}>Voir le détail</button>
    </footer>
  </article>
}

export default function ReplacementsPage({ replacements, onDetails, onDuplicate, navigate, initialFilter = 'all' }) {
  const [filter, setFilter] = useState(initialFilter)
  const categorized = useMemo(() => replacements.map((replacement) => ({ replacement, category: getReplacementCategory(replacement) })), [replacements])
  const counts = useMemo(() => categorized.reduce((result, item) => ({ ...result, [item.category]: (result[item.category] || 0) + 1 }), {}), [categorized])
  const visible = filter === 'all' ? categorized : categorized.filter((item) => item.category === filter)
  const sorted = [...visible].sort((a, b) => {
    const priority = { urgent: 0, open: 1, filled: 2, completed: 3 }
    if (priority[a.category] !== priority[b.category]) return priority[a.category] - priority[b.category]
    return `${a.replacement.replacement_date}${a.replacement.start_time}`.localeCompare(`${b.replacement.replacement_date}${b.replacement.start_time}`)
  })

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Centre de pilotage</p><h1>Remplacements</h1><p>Repérez immédiatement les demandes qui nécessitent une action.</p></div><button className="button primary hero-button" onClick={() => navigate('replacement')}>+ Créer un remplacement</button></header>

    <div className="replacement-summary">
      {['urgent', 'open', 'filled', 'completed'].map((category) => <button key={category} className={`summary-card ${category} ${filter === category ? 'active' : ''}`} onClick={() => setFilter(filter === category ? 'all' : category)}>
        <span>{categoryLabels[category]}</span><strong>{counts[category] || 0}</strong><small>{category === 'urgent' ? 'à traiter maintenant' : category === 'open' ? 'encore sans coach' : category === 'filled' ? 'déjà attribués' : 'archivés automatiquement'}</small>
      </button>)}
    </div>

    <div className="replacement-toolbar">
      <div><h2>{filter === 'all' ? 'Toutes les demandes' : categoryLabels[filter]}</h2><p>{visible.length} remplacement{visible.length > 1 ? 's' : ''}</p></div>
      <div className="filter-pills">{filters.map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'Tous' : categoryLabels[value]}</button>)}</div>
    </div>

    {sorted.length ? <div className="replacement-grid">{sorted.map(({ replacement, category }) => <ReplacementCard key={replacement.id} replacement={replacement} category={category} onDetails={onDetails} onDuplicate={onDuplicate} />)}</div> : <section className="card empty"><strong>Aucun remplacement dans cette catégorie</strong><p>Les prochaines demandes apparaîtront ici.</p></section>}
  </div>
}

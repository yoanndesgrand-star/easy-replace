import { formatDate } from '../lib/format'
import { categoryLabels, getReplacementCategory } from '../lib/replacementView'

export default function DashboardPage({ coaches, replacements, settings, navigate }) {
  const active = coaches.filter((coach) => coach.is_active).length
  const categorized = replacements.map((replacement) => ({ replacement, category: getReplacementCategory(replacement, new Date(), Number(settings?.urgency_hours || 24)) }))
  const counts = categorized.reduce((result, item) => ({ ...result, [item.category]: (result[item.category] || 0) + 1 }), {})
  const actionItems = categorized.filter((item) => ['urgent', 'open'].includes(item.category)).slice(0, 5)

  return <div className="page"><header className="page-header"><div><p className="eyebrow">Vue d’ensemble</p><h1>Bonjour 👋</h1><p>{counts.urgent ? `${counts.urgent} remplacement${counts.urgent > 1 ? 's' : ''} urgent${counts.urgent > 1 ? 's' : ''} nécessite${counts.urgent > 1 ? 'nt' : ''} votre attention.` : 'Aucune urgence. Votre activité est sous contrôle.'}</p></div><button className="button primary hero-button" onClick={() => navigate('replacement')}>+ Créer un remplacement</button></header>
    <div className="dashboard-kpis">
      <button className="dashboard-kpi urgent" onClick={() => navigate('replacements', { filter: 'urgent' })}><span>Urgents</span><strong>{counts.urgent || 0}</strong><small>à traiter maintenant</small></button>
      <button className="dashboard-kpi open" onClick={() => navigate('replacements', { filter: 'open' })}><span>À pourvoir</span><strong>{counts.open || 0}</strong><small>encore sans coach</small></button>
      <button className="dashboard-kpi filled" onClick={() => navigate('replacements', { filter: 'filled' })}><span>Pourvus</span><strong>{counts.filled || 0}</strong><small>remplacements attribués</small></button>
      <article className="dashboard-kpi neutral"><span>Coachs actifs</span><strong>{active}</strong><small>prêts à être contactés</small></article>
    </div>
    <section className="card"><div className="section-title"><div><h2>À suivre</h2><p>Les demandes qui peuvent encore nécessiter une action</p></div><button className="link-button" onClick={() => navigate('replacements')}>Voir tous les remplacements →</button></div>
      {actionItems.length ? <div className="action-list">{actionItems.map(({ replacement, category }) => <button className={`action-row ${category}`} key={replacement.id} onClick={() => navigate('details', replacement)}><span className="action-indicator"/><span><strong>{replacement.class_type} · {replacement.venue}</strong><small>{formatDate(replacement.replacement_date, { weekday: 'long', day: 'numeric', month: 'long' })} · {replacement.start_time?.slice(0, 5)} – {replacement.end_time?.slice(0, 5)}</small></span><em className={`category-pill ${category}`}>{categoryLabels[category]}</em></button>)}</div>
      : <div className="empty"><strong>Tout est sous contrôle</strong><p>Aucune demande ne nécessite d’action pour le moment.</p></div>}
    </section>
  </div>
}

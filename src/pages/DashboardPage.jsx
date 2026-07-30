import { formatDate, statusLabels } from '../lib/format'

export default function DashboardPage({ coaches, replacements, navigate }) {
  const month = new Date().toISOString().slice(0, 7)
  const active = coaches.filter((c) => c.is_active).length
  const sentThisMonth = replacements.filter((r) => r.status === 'sent' && r.created_at?.startsWith(month)).length
  const open = replacements.filter((r) => ['draft', 'sent'].includes(r.status)).length
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Vue d’ensemble</p><h1>Bonjour 👋</h1><p>Que souhaitez-vous organiser aujourd’hui ?</p></div><button className="button primary hero-button" onClick={() => navigate('replacement')}>+ Créer un appel à remplacement</button></header>
    <div className="stats"><article><span>Coachs actifs</span><strong>{active}</strong><small>prêts à être contactés</small></article><article><span>Demandes ce mois</span><strong>{sentThisMonth}</strong><small>appels envoyés</small></article><article><span>Non pourvues</span><strong>{open}</strong><small>demandes à suivre</small></article></div>
    <section className="card"><div className="section-title"><div><h2>Dernières demandes</h2><p>Vos cinq appels les plus récents</p></div><button className="link-button" onClick={() => navigate('history')}>Voir tout →</button></div>
      {replacements.length ? <div className="list">{replacements.slice(0, 5).map((r) => <button className="list-row" key={r.id} onClick={() => navigate('details', r)}><span className="date-box"><strong>{formatDate(r.replacement_date, { day: '2-digit' })}</strong><small>{formatDate(r.replacement_date, { month: 'short' })}</small></span><span><strong>{r.class_type} · {r.venue}</strong><small>{r.start_time?.slice(0, 5)} – {r.end_time?.slice(0, 5)}</small></span><em className={`badge ${r.status}`}>{statusLabels[r.status]}</em></button>)}</div>
      : <div className="empty"><strong>Aucune demande pour le moment</strong><p>Créez votre premier appel à remplacement.</p></div>}
    </section>
  </div>
}

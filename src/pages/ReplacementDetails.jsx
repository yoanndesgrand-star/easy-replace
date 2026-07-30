import { formatDate, statusLabels } from '../lib/format'

export default function ReplacementDetails({ replacement, onBack, onDuplicate }) {
  if (!replacement) return null
  const fields = [
    ['Établissement', replacement.venue], ['Adresse', replacement.address || '—'],
    ['Date', formatDate(replacement.replacement_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
    ['Horaire', `${replacement.start_time?.slice(0, 5)} – ${replacement.end_time?.slice(0, 5)}`],
    ['Cours', replacement.class_type], ['Spécialité', replacement.required_specialty],
    ['Contact', `${replacement.manager_name} · ${replacement.manager_phone}`],
  ]
  return <div className="page"><button className="back" onClick={onBack}>← Retour à l’historique</button><header className="page-header"><div><p className="eyebrow">Détail de la demande</p><h1>{replacement.class_type} · {replacement.venue}</h1><span className={`badge ${replacement.status}`}>{statusLabels[replacement.status]}</span></div><button className="button secondary" onClick={() => onDuplicate(replacement)}>Dupliquer</button></header>
    <div className="details-grid"><section className="card"><h2>Informations</h2><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="card"><h2>Message envoyé</h2><blockquote>{replacement.message}</blockquote></section></div>
    <section className="card"><div className="section-title"><div><h2>Coachs contactés</h2><p>{replacement.replacement_recipients?.length || 0} destinataires</p></div></div><div className="recipient-list">{replacement.replacement_recipients?.map((r) => <div key={r.id}><span><strong>{r.coach_name_snapshot}</strong><small>{r.phone_snapshot}</small></span><span><em className={`badge ${r.sms_status}`}>{statusLabels[r.sms_status]}</em>{r.error_message && <small className="danger-text">{r.error_message}</small>}</span></div>)}</div></section>
  </div>
}

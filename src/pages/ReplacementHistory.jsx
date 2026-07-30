import { formatDate, statusLabels } from '../lib/format'

export default function ReplacementHistory({ replacements, onDetails, onDuplicate, onStatus, onDelete }) {
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Suivi</p><h1>Historique</h1><p>Retrouvez et gérez toutes vos demandes.</p></div></header><section className="card table-card">
    {replacements.length ? <div className="responsive-table"><table><thead><tr><th>Date</th><th>Remplacement</th><th>Coachs</th><th>Envois</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{replacements.map((r) => {
      const recipients = r.replacement_recipients || []
      return <tr key={r.id}><td><strong>{formatDate(r.replacement_date, { day: '2-digit', month: 'short', year: 'numeric' })}</strong><small>{r.start_time?.slice(0, 5)} – {r.end_time?.slice(0, 5)}</small></td><td><strong>{r.class_type}</strong><small>{r.venue}</small></td><td>{recipients.length}</td><td><span className="success-text">{recipients.filter((x) => x.sms_status === 'sent').length} envoyés</span><small className="danger-text">{recipients.filter((x) => x.sms_status === 'failed').length} échecs</small></td><td><span className={`badge ${r.status}`}>{statusLabels[r.status]}</span></td><td><div className="actions"><button onClick={() => onDetails(r)}>Consulter</button><button onClick={() => onDuplicate(r)}>Dupliquer</button>{!['filled', 'cancelled'].includes(r.status) && <><button onClick={() => onStatus(r.id, 'filled')}>Marquer pourvu</button><button onClick={() => onStatus(r.id, 'cancelled')}>Annuler</button></>}<button className="danger" onClick={() => window.confirm('Supprimer définitivement cette demande ?') && onDelete(r.id)}>Supprimer</button></div></td></tr>
    })}</tbody></table></div> : <div className="empty"><strong>Historique vide</strong><p>Les demandes envoyées apparaîtront ici.</p></div>}
  </section></div>
}

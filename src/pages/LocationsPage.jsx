import { useState } from 'react'
import Notice from '../components/Notice'

export default function LocationsPage({ locations, coaches, onSave, onToggle, onDelete }) {
  const [editing, setEditing] = useState(undefined)
  const [form, setForm] = useState({ name: '', address: '', is_active: true })
  const [error, setError] = useState('')
  function open(location = null) { setEditing(location); setForm(location ? { ...location } : { name: '', address: '', is_active: true }); setError('') }
  async function submit(e) { e.preventDefault(); try { await onSave(form); setEditing(undefined) } catch (err) { setError(err.message) } }
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Organisation</p><h1>Salles et lieux</h1><p>Créez les clubs utilisés pour les coachs et les remplacements.</p></div><button className="button primary" onClick={() => open()}>+ Ajouter une salle</button></header>
    <section className="card">{locations.length ? <div className="location-grid">{locations.map((location) => {
      const assigned = coaches.filter((coach) => (coach.location_ids || []).includes(location.id))
      const primary = coaches.filter((coach) => coach.primary_location_id === location.id)
      return <article className={`location-card ${!location.is_active ? 'inactive' : ''}`} key={location.id}><header><div><h3>{location.name}</h3><span className={`badge ${location.is_active ? 'sent' : 'cancelled'}`}>{location.is_active ? 'Active' : 'Inactive'}</span></div></header><p>{location.address || 'Adresse non renseignée'}</p><div className="location-stats"><span><strong>{assigned.length}</strong><small>coach{assigned.length > 1 ? 's' : ''}</small></span><span><strong>{primary.length}</strong><small>salle habituelle</small></span></div><footer><button onClick={() => open(location)}>Modifier</button><button onClick={() => onToggle(location)}>{location.is_active ? 'Désactiver' : 'Réactiver'}</button><button className="danger" onClick={() => window.confirm(`Supprimer ${location.name} ? Les historiques conserveront le nom de la salle.`) && onDelete(location.id)}>Supprimer</button></footer></article>
    })}</div> : <div className="empty"><strong>Aucune salle enregistrée</strong><p>Ajoutez votre premier établissement ou lieu d’intervention.</p></div>}</section>
    {editing !== undefined && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditing(undefined)}><form className="modal" onSubmit={submit}><header><div><p className="eyebrow">Salle</p><h2>{editing ? 'Modifier la salle' : 'Ajouter une salle'}</h2></div><button type="button" className="icon-button" onClick={() => setEditing(undefined)}>×</button></header><Notice type="error">{error}</Notice><div className="form-grid"><label>Nom<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="On Air BNF" /></label><label>Adresse<input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label></div><label className="switch"><input type="checkbox" checked={form.is_active !== false} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Salle active</label><footer><button type="button" className="button secondary" onClick={() => setEditing(undefined)}>Annuler</button><button className="button primary">Enregistrer</button></footer></form></div>}
  </div>
}

import { useMemo, useState } from 'react'
import CoachForm from '../components/CoachForm'

export default function CoachesPage({ coaches, locations = [], onSave, onToggle, onDelete }) {
  const [editing, setEditing] = useState(undefined)
  const [search, setSearch] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const specialties = [...new Set(coaches.flatMap((c) => c.specialties || []))].sort()
  const filtered = useMemo(() => coaches.filter((c) => {
    const name = `${c.first_name} ${c.last_name}`.toLowerCase()
    return name.includes(search.toLowerCase()) && (!specialty || c.specialties?.includes(specialty)) && (!locationFilter || (c.location_ids || []).includes(locationFilter))
  }), [coaches, search, specialty, locationFilter])
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Répertoire</p><h1>Coachs</h1><p>{coaches.filter((c) => c.is_active).length} coachs actifs sur {coaches.length}</p></div><button className="button primary" onClick={() => setEditing(null)}>+ Ajouter un coach</button></header>
    <section className="card"><div className="filters"><input type="search" placeholder="Rechercher un coach…" value={search} onChange={(e) => setSearch(e.target.value)} /><select value={specialty} onChange={(e) => setSpecialty(e.target.value)}><option value="">Toutes les spécialités</option>{specialties.map((s) => <option key={s}>{s}</option>)}</select><select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}><option value="">Toutes les salles</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      {filtered.length ? <div className="coach-grid">{filtered.map((coach) => <article className={`coach-card ${!coach.is_active ? 'inactive' : ''}`} key={coach.id}><header><div className="avatar">{coach.first_name[0]}{coach.last_name[0]}</div><div><h3>{coach.first_name} {coach.last_name}</h3><span className={`badge ${coach.is_active ? 'sent' : 'cancelled'}`}>{coach.is_active ? 'Actif' : 'Inactif'}</span></div></header><p>{coach.phone}</p><p>{coach.email || 'E-mail non renseigné'}</p><div className="tags">{coach.specialties?.map((s) => <span key={s}>{s}</span>)}</div><div className="coach-locations">{(coach.location_ids || []).map((id) => { const l = locations.find((item) => item.id === id); return l ? <span key={id} className={coach.primary_location_id === id ? 'primary' : ''}>{l.name}{coach.primary_location_id === id ? ' · habituelle' : ''}</span> : null })}{!(coach.location_ids || []).length && <small>Aucune salle associée</small>}</div><footer><button onClick={() => setEditing(coach)}>Modifier</button><button onClick={() => onToggle(coach)}>{coach.is_active ? 'Désactiver' : 'Réactiver'}</button><button className="danger" onClick={() => window.confirm(`Supprimer ${coach.first_name} ${coach.last_name} ?`) && onDelete(coach.id)}>Supprimer</button></footer></article>)}</div>
      : <div className="empty"><strong>Aucun coach trouvé</strong><p>Modifiez vos filtres ou ajoutez un coach.</p></div>}
    </section>
    {editing !== undefined && <CoachForm coach={editing} locations={locations} onCancel={() => setEditing(undefined)} onSave={async (value) => { await onSave(value); setEditing(undefined) }} />}
  </div>
}

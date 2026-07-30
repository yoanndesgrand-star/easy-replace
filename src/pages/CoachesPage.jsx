import { useMemo, useState } from 'react'
import CoachForm from '../components/CoachForm'

const dayLabels = {
  monday: 'Lun', tuesday: 'Mar', wednesday: 'Mer', thursday: 'Jeu', friday: 'Ven', saturday: 'Sam', sunday: 'Dim',
}

function formatDate(value) {
  if (!value) return 'Aucun remplacement'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function getCoachStats(coach, replacements) {
  const recipients = replacements.flatMap((request) =>
    (request.replacement_recipients || []).filter((recipient) => recipient.coach_id === coach.id)
      .map((recipient) => ({ ...recipient, request })),
  )
  const responses = recipients.filter((recipient) => ['accepted', 'declined'].includes(recipient.response_status)).length
  const acceptances = recipients.filter((recipient) => recipient.response_status === 'accepted').length
  const acceptedRequests = replacements.filter((request) => request.accepted_coach_id === coach.id)
  const lastReplacement = acceptedRequests
    .map((request) => request.accepted_at || `${request.replacement_date}T${request.start_time || '00:00:00'}`)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null
  return {
    received: recipients.length,
    acceptances,
    responseRate: recipients.length ? Math.round((responses / recipients.length) * 100) : 0,
    lastReplacement,
  }
}

export default function CoachesPage({ coaches, replacements = [], locations = [], onSave, onToggle, onArchive, onRestore }) {
  const [editing, setEditing] = useState(undefined)
  const [search, setSearch] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('current')
  const specialties = [...new Set(coaches.flatMap((c) => c.specialties || []))].sort()
  const filtered = useMemo(() => coaches.filter((c) => {
    const searchable = `${c.first_name} ${c.last_name} ${c.phone} ${c.email || ''}`.toLowerCase()
    const statusMatches = statusFilter === 'archived' ? Boolean(c.archived_at)
      : statusFilter === 'active' ? !c.archived_at && c.is_active
        : statusFilter === 'inactive' ? !c.archived_at && !c.is_active
          : !c.archived_at
    return searchable.includes(search.toLowerCase()) && statusMatches && (!specialty || c.specialties?.includes(specialty)) && (!locationFilter || (c.location_ids || []).includes(locationFilter))
  }), [coaches, search, specialty, locationFilter, statusFilter])
  const currentCount = coaches.filter((c) => !c.archived_at).length
  const activeCount = coaches.filter((c) => !c.archived_at && c.is_active).length

  return <div className="page"><header className="page-header"><div><p className="eyebrow">Répertoire enrichi</p><h1>Coachs</h1><p>{activeCount} coachs actifs sur {currentCount} fiches actuelles</p></div><button className="button primary" onClick={() => setEditing(null)}>+ Ajouter un coach</button></header>
    <section className="card"><div className="filters coach-filters"><input type="search" placeholder="Rechercher un coach…" value={search} onChange={(e) => setSearch(e.target.value)} /><select value={specialty} onChange={(e) => setSpecialty(e.target.value)}><option value="">Toutes les spécialités</option>{specialties.map((s) => <option key={s}>{s}</option>)}</select><select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}><option value="">Toutes les salles</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="current">Coachs actuels</option><option value="active">Actifs</option><option value="inactive">Inactifs</option><option value="archived">Archivés</option></select></div>
      {filtered.length ? <div className="coach-grid enriched">{filtered.map((coach) => { const stats = getCoachStats(coach, replacements); const primaryLocation = locations.find((item) => item.id === coach.primary_location_id); return <article className={`coach-card enriched ${!coach.is_active ? 'inactive' : ''} ${coach.archived_at ? 'archived' : ''}`} key={coach.id}><header><div className="avatar">{coach.first_name[0]}{coach.last_name[0]}</div><div><h3>{coach.first_name} {coach.last_name}</h3><span className={`badge ${coach.archived_at ? 'cancelled' : coach.is_active ? 'sent' : 'draft'}`}>{coach.archived_at ? 'Archivé' : coach.is_active ? 'Actif' : 'Inactif'}</span></div></header>
        <div className="coach-contact"><span>{coach.phone}</span><span>{coach.email || 'E-mail non renseigné'}</span></div>
        <div className="tags">{coach.specialties?.length ? coach.specialties.map((s) => <span key={s}>{s}</span>) : <small>Aucune spécialité renseignée</small>}</div>
        <div className="coach-profile-line"><strong>Salle habituelle</strong><span>{primaryLocation?.name || 'Non définie'}</span></div>
        <div className="coach-profile-line"><strong>Disponibilités</strong><div className="availability-tags">{coach.available_days?.length ? coach.available_days.map((day) => <span key={day}>{dayLabels[day] || day}</span>) : <small>Non renseignées</small>}</div></div>
        <div className="coach-metrics"><div><strong>{stats.received}</strong><small>Demandes reçues</small></div><div><strong>{stats.acceptances}</strong><small>Acceptations</small></div><div><strong>{stats.responseRate}%</strong><small>Taux de réponse</small></div></div>
        <div className="last-replacement"><small>Dernier remplacement</small><strong>{formatDate(stats.lastReplacement)}</strong></div>
        {coach.notes && <details className="coach-notes"><summary>Notes internes</summary><p>{coach.notes}</p></details>}
        <footer>{!coach.archived_at ? <><button onClick={() => setEditing(coach)}>Modifier</button><button onClick={() => onToggle(coach)}>{coach.is_active ? 'Désactiver' : 'Réactiver'}</button><button className="danger" onClick={() => window.confirm(`Archiver la fiche de ${coach.first_name} ${coach.last_name} ? Son historique sera conservé.`) && onArchive(coach.id)}>Archiver</button></> : <button onClick={() => window.confirm(`Restaurer la fiche de ${coach.first_name} ${coach.last_name} ?`) && onRestore(coach.id)}>Restaurer la fiche</button>}</footer>
      </article> })}</div>
      : <div className="empty"><strong>Aucun coach trouvé</strong><p>Modifiez vos filtres ou ajoutez un coach.</p></div>}
    </section>
    {editing !== undefined && <CoachForm coach={editing} locations={locations} onCancel={() => setEditing(undefined)} onSave={async (value) => { await onSave(value); setEditing(undefined) }} />}
  </div>
}

import { useMemo, useState } from 'react'
import { buildSms } from '../lib/format'
import Notice from '../components/Notice'

const empty = { location_id: '', venue: '', address: '', replacement_date: '', start_time: '', end_time: '', class_type: '', required_specialty: '', manager_name: '', manager_phone: '', comment: '' }

export default function ReplacementPage({ coaches, locations = [], settings, duplicate, onSend, clearDuplicate }) {
  const [form, setForm] = useState(() => duplicate ? { ...empty, ...duplicate, replacement_date: '' } : { ...empty, venue: settings?.establishment_name || '', manager_name: settings?.manager_name || '', manager_phone: settings?.phone || '' })
  const [selected, setSelected] = useState([])
  const [filter, setFilter] = useState(duplicate?.required_specialty || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const active = coaches.filter((c) => c.is_active)
  const selectedLocationId = form.location_id || ''
  const visible = useMemo(() => active.filter((c) => (!filter || c.specialties?.includes(filter)) && (!selectedLocationId || (c.location_ids || []).includes(selectedLocationId))), [active, filter, selectedLocationId])
  const specialties = [...new Set(active.flatMap((c) => c.specialties || []))].sort()
  const message = buildSms(form, settings?.sms_template)
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }))
  async function submit(e) {
    e.preventDefault(); setError('')
    if (!selected.length) return setError('Sélectionnez au moins un coach.')
    if (form.start_time >= form.end_time) return setError('L’heure de fin doit être après l’heure de début.')
    setLoading(true)
    try { await onSend(form, active.filter((c) => selected.includes(c.id)), message); clearDuplicate() }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }
  return <div className="page"><header className="page-header"><div><p className="eyebrow">{duplicate ? 'Nouvelle demande dupliquée' : 'Nouvelle demande'}</p><h1>Créer un remplacement</h1><p>Renseignez le besoin puis choisissez les coachs à contacter.</p></div></header>
    <form onSubmit={submit}><section className="card form-section"><div className="section-title"><span className="step">1</span><div><h2>Le remplacement</h2><p>Informations essentielles de la séance</p></div></div><div className="form-grid">
      <label>Salle<select required value={form.location_id || ''} onChange={(e) => { const location = locations.find((item) => item.id === e.target.value); set('location_id', e.target.value); set('venue', location?.name || ''); set('address', location?.address || ''); setSelected([]) }}><option value="">Choisir une salle…</option>{locations.filter((item) => item.is_active).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Adresse<input readOnly value={form.address} placeholder="Renseignée dans la fiche de la salle" /></label>
      <label>Date<input required type="date" value={form.replacement_date} onChange={(e) => set('replacement_date', e.target.value)} /></label><div className="paired"><label>Début<input required type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} /></label><label>Fin<input required type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} /></label></div>
      <label>Type de cours<input required value={form.class_type} onChange={(e) => set('class_type', e.target.value)} placeholder="Pilates" /></label><label>Spécialité requise<select required value={form.required_specialty} onChange={(e) => { set('required_specialty', e.target.value); setFilter(e.target.value) }}><option value="">Choisir…</option>{specialties.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Nom du responsable<input required value={form.manager_name} onChange={(e) => set('manager_name', e.target.value)} /></label><label>Téléphone de contact<input required type="tel" value={form.manager_phone} onChange={(e) => set('manager_phone', e.target.value)} /></label>
      <label className="wide">Commentaire <span>(facultatif, restez bref)</span><textarea maxLength="120" value={form.comment} onChange={(e) => set('comment', e.target.value)} /></label>
    </div></section>
    <section className="card form-section"><div className="section-title"><span className="step">2</span><div><h2>Coachs à contacter</h2><p>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}{selectedLocationId ? ` · ${visible.length} compatible${visible.length > 1 ? 's' : ''} avec cette salle` : ''}</p></div></div><div className="filters"><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Toutes les spécialités</option>{specialties.map((s) => <option key={s}>{s}</option>)}</select><button type="button" className="link-button" onClick={() => setSelected(visible.map((c) => c.id))}>Tout sélectionner</button><button type="button" className="link-button" onClick={() => setSelected([])}>Tout désélectionner</button></div>
      <div className="check-list">{visible.map((c) => <label key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={() => setSelected((old) => old.includes(c.id) ? old.filter((id) => id !== c.id) : [...old, c.id])} /><span><strong>{c.first_name} {c.last_name}</strong><small>{c.specialties?.join(' · ')}</small></span></label>)}</div>{!visible.length && <div className="empty">Aucun coach actif pour ce filtre.</div>}
    </section>
    <section className="card form-section"><div className="section-title"><span className="step">3</span><div><h2>Aperçu du SMS</h2><p>{message.length} caractères</p></div></div><blockquote>{message}</blockquote><Notice type="error">{error}</Notice><div className="submit-row"><span>{selected.length} coach{selected.length > 1 ? 's' : ''} recevra{selected.length > 1 ? 'ont' : ''} ce message</span><button className="button primary" disabled={loading}>{loading ? 'Envoi en cours…' : 'Envoyer la demande'}</button></div></section></form>
  </div>
}

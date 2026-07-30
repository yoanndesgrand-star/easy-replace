import { useEffect, useState } from 'react'
import { isValidInternationalPhone } from '../lib/format'

const empty = { first_name: '', last_name: '', phone: '', email: '', specialties: [], location: '', notes: '', is_active: true, location_ids: [], primary_location_id: null }

export default function CoachForm({ coach, locations = [], onSave, onCancel }) {
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  useEffect(() => setForm(coach ? { ...empty, ...coach } : empty), [coach])
  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const activeLocations = locations.filter((location) => location.is_active || form.location_ids?.includes(location.id))
  function toggleLocation(id) {
    const selected = form.location_ids || []
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]
    change('location_ids', next)
    if (!next.includes(form.primary_location_id)) change('primary_location_id', next[0] || null)
  }
  function submit(event) {
    event.preventDefault()
    if (!isValidInternationalPhone(form.phone)) return setError('Saisissez un numéro de téléphone valide.')
    onSave({ ...form, specialties: Array.isArray(form.specialties) ? form.specialties : [] }).catch((err) => setError(err.message))
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}><form className="modal coach-modal" onSubmit={submit}>
    <header><div><p className="eyebrow">Répertoire</p><h2>{coach ? 'Modifier le coach' : 'Ajouter un coach'}</h2></div><button type="button" className="icon-button" onClick={onCancel}>×</button></header>
    {error && <div className="notice error">{error}</div>}
    <div className="form-grid">
      <label>Prénom<input required value={form.first_name} onChange={(e) => change('first_name', e.target.value)} /></label><label>Nom<input required value={form.last_name} onChange={(e) => change('last_name', e.target.value)} /></label>
      <label>Téléphone<input required type="tel" placeholder="06 12 34 56 78" value={form.phone} onChange={(e) => change('phone', e.target.value)} /></label><label>E-mail<input type="email" value={form.email || ''} onChange={(e) => change('email', e.target.value)} /></label>
      <label className="wide">Spécialités <span>(séparées par des virgules)</span><input value={(form.specialties || []).join(', ')} onChange={(e) => change('specialties', e.target.value.split(',').map((v) => v.trim()).filter(Boolean))} placeholder="Pilates, Yoga, Cycling" /></label>
      <fieldset className="wide location-assignment"><legend>Salles associées</legend>{activeLocations.length ? <div className="location-checks">{activeLocations.map((location) => <label key={location.id} className="check-card"><input type="checkbox" checked={(form.location_ids || []).includes(location.id)} onChange={() => toggleLocation(location.id)} /><span><strong>{location.name}</strong><small>{location.address || 'Adresse non renseignée'}</small></span></label>)}</div> : <p className="muted">Créez d’abord une salle depuis le menu Salles.</p>}
      {(form.location_ids || []).length > 0 && <label className="primary-location">Salle habituelle<select value={form.primary_location_id || ''} onChange={(e) => change('primary_location_id', e.target.value)}>{(form.location_ids || []).map((id) => { const location = locations.find((item) => item.id === id); return location ? <option key={id} value={id}>{location.name}</option> : null })}</select></label>}</fieldset>
      <label className="wide">Notes<textarea rows="3" value={form.notes || ''} onChange={(e) => change('notes', e.target.value)} /></label>
    </div><label className="switch"><input type="checkbox" checked={form.is_active} onChange={(e) => change('is_active', e.target.checked)} /> Coach actif</label>
    <footer><button type="button" className="button secondary" onClick={onCancel}>Annuler</button><button className="button primary">Enregistrer</button></footer>
  </form></div>
}

import { useState } from 'react'
import { buildSms } from '../lib/format'
import Notice from '../components/Notice'

export default function EditReplacementPage({ replacement, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    venue: replacement.venue || '', address: replacement.address || '', replacement_date: replacement.replacement_date || '',
    start_time: replacement.start_time?.slice(0, 5) || '', end_time: replacement.end_time?.slice(0, 5) || '',
    class_type: replacement.class_type || '', required_specialty: replacement.required_specialty || '',
    manager_name: replacement.manager_name || '', manager_phone: replacement.manager_phone || '', comment: '',
  }))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }))
  const message = buildSms(form)

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (form.start_time >= form.end_time) return setError('L’heure de fin doit être après l’heure de début.')
    setLoading(true)
    try { await onSave({ ...form, message }) }
    catch (err) { setError(err.message || 'La modification a échoué.') }
    finally { setLoading(false) }
  }

  return <div className="page">
    <button className="back" onClick={onCancel}>← Annuler la modification</button>
    <header className="page-header"><div><p className="eyebrow">Modification</p><h1>Modifier le remplacement</h1><p>Les coachs déjà contactés ne recevront pas automatiquement un nouveau SMS.</p></div></header>
    <form onSubmit={submit}><section className="card form-section"><div className="section-title"><div><h2>Informations de la séance</h2><p>Modifiez uniquement les éléments nécessaires</p></div></div><div className="form-grid">
      <label>Établissement<input required value={form.venue} onChange={(e) => set('venue', e.target.value)} /></label>
      <label>Adresse <span>(facultatif)</span><input value={form.address} onChange={(e) => set('address', e.target.value)} /></label>
      <label>Date<input required type="date" value={form.replacement_date} onChange={(e) => set('replacement_date', e.target.value)} /></label>
      <div className="paired"><label>Début<input required type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} /></label><label>Fin<input required type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} /></label></div>
      <label>Type de cours<input required value={form.class_type} onChange={(e) => set('class_type', e.target.value)} /></label>
      <label>Spécialité requise<input required value={form.required_specialty} onChange={(e) => set('required_specialty', e.target.value)} /></label>
      <label>Nom du responsable<input required value={form.manager_name} onChange={(e) => set('manager_name', e.target.value)} /></label>
      <label>Téléphone de contact<input required type="tel" value={form.manager_phone} onChange={(e) => set('manager_phone', e.target.value)} /></label>
      <label className="wide">Commentaire <span>(facultatif)</span><textarea maxLength="120" value={form.comment} onChange={(e) => set('comment', e.target.value)} /></label>
    </div></section>
    <section className="card form-section"><div className="section-title"><div><h2>Aperçu du message</h2><p>Le message sera enregistré avec les nouvelles informations</p></div></div><blockquote>{message}</blockquote><Notice type="error">{error}</Notice><div className="submit-row"><button type="button" className="button secondary" onClick={onCancel}>Annuler</button><button className="button primary" disabled={loading}>{loading ? 'Enregistrement…' : 'Enregistrer les modifications'}</button></div></section></form>
  </div>
}

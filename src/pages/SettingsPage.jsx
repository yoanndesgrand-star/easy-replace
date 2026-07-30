import { useEffect, useState } from 'react'
import Notice from '../components/Notice'
import { DEFAULT_SMS_TEMPLATE, uploadLogo } from '../services/settings'

const timezones = ['Europe/Paris', 'Europe/Brussels', 'Europe/Luxembourg', 'Europe/Zurich', 'Europe/London', 'America/Martinique', 'Indian/Reunion']

export default function SettingsPage({ settings, onSave }) {
  const [form, setForm] = useState(settings)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => setForm(settings), [settings])
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }))
  const locations = Array.isArray(form.locations) ? form.locations : []

  function addLocation() {
    set('locations', [...locations, { name: '', address: '' }])
  }
  function updateLocation(index, key, value) {
    set('locations', locations.map((item, i) => i === index ? { ...item, [key]: value } : item))
  }
  function removeLocation(index) {
    set('locations', locations.filter((_, i) => i !== index))
  }
  async function handleLogo(file) {
    if (!file) return
    setError(''); setUploading(true)
    try { set('logo_url', await uploadLogo(file)) }
    catch (err) { setError(err.message) }
    finally { setUploading(false) }
  }
  async function submit(event) {
    event.preventDefault(); setError(''); setSuccess('')
    if (Number(form.urgency_hours) < 1 || Number(form.urgency_hours) > 168) return setError('Le délai d’urgence doit être compris entre 1 et 168 heures.')
    const cleanLocations = locations.map((item) => ({ name: item.name.trim(), address: item.address.trim() })).filter((item) => item.name)
    setLoading(true)
    try {
      await onSave({ ...form, locations: cleanLocations })
      setSuccess('Les paramètres ont été enregistrés.')
    } catch (err) { setError(err.message || 'Enregistrement impossible.') }
    finally { setLoading(false) }
  }

  return <div className="page settings-page">
    <header className="page-header"><div><p className="eyebrow">Configuration</p><h1>Paramètres de l’établissement</h1><p>Ces informations préremplissent les demandes et définissent le fonctionnement d’Easy Replace.</p></div></header>
    <form onSubmit={submit}>
      <section className="card form-section"><div className="section-title"><div><h2>Identité et contact</h2><p>Informations principales visibles dans les demandes</p></div></div><div className="form-grid">
        <label>Nom de l’établissement<input required value={form.establishment_name || ''} onChange={(e) => set('establishment_name', e.target.value)} placeholder="On Air BNF" /></label>
        <label>Nom du responsable<input required value={form.manager_name || ''} onChange={(e) => set('manager_name', e.target.value)} /></label>
        <label>Téléphone<input required type="tel" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></label>
        <label>Adresse e-mail<input required type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></label>
      </div></section>

      <section className="card form-section"><div className="section-title"><div><h2>Salles et adresses</h2><p>Ajoutez les lieux proposés lors de la création d’un remplacement</p></div><button type="button" className="button secondary compact" onClick={addLocation}>+ Ajouter une salle</button></div>
        <div className="settings-locations">{locations.map((location, index) => <div className="settings-location" key={index}>
          <label>Nom de la salle<input value={location.name || ''} onChange={(e) => updateLocation(index, 'name', e.target.value)} placeholder="Salle principale" /></label>
          <label>Adresse<input value={location.address || ''} onChange={(e) => updateLocation(index, 'address', e.target.value)} placeholder="12 rue…" /></label>
          <button type="button" className="icon-danger" onClick={() => removeLocation(index)} aria-label="Supprimer cette salle">×</button>
        </div>)}</div>
        {!locations.length && <div className="empty compact-empty">Aucune salle enregistrée. L’établissement principal restera proposé par défaut.</div>}
      </section>

      <section className="card form-section"><div className="section-title"><div><h2>SMS par défaut</h2><p>Variables disponibles : {'{date} {debut} {fin} {etablissement} {adresse} {cours} {responsable} {telephone} {commentaire}'}</p></div></div>
        <label className="wide">Modèle du SMS<textarea className="sms-template" maxLength="500" value={form.sms_template || ''} onChange={(e) => set('sms_template', e.target.value)} /></label>
        <div className="template-actions"><span>{(form.sms_template || '').length} caractères avant remplacement des variables</span><button type="button" className="link-button" onClick={() => set('sms_template', DEFAULT_SMS_TEMPLATE)}>Réinitialiser le modèle</button></div>
      </section>

      <section className="card form-section"><div className="section-title"><div><h2>Règles et personnalisation</h2><p>Comportement opérationnel de l’application</p></div></div><div className="form-grid">
        <label>Délai d’urgence <span>(heures)</span><input required type="number" min="1" max="168" value={form.urgency_hours ?? 24} onChange={(e) => set('urgency_hours', e.target.value)} /></label>
        <label>Fuseau horaire<select value={form.timezone || 'Europe/Paris'} onChange={(e) => set('timezone', e.target.value)}>{timezones.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
        <div className="wide logo-setting"><div><strong>Logo de l’établissement</strong><p>PNG, JPG ou WebP, 2 Mo maximum.</p></div>{form.logo_url && <img src={form.logo_url} alt="Logo de l’établissement" />}<label className="button secondary compact file-button">{uploading ? 'Envoi…' : 'Choisir un logo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(e) => handleLogo(e.target.files?.[0])} /></label>{form.logo_url && <button type="button" className="link-button danger-text" onClick={() => set('logo_url', '')}>Retirer</button>}</div>
      </div></section>
      <Notice type="error">{error}</Notice><Notice type="success">{success}</Notice>
      <div className="settings-submit"><button className="button primary" disabled={loading || uploading}>{loading ? 'Enregistrement…' : 'Enregistrer les paramètres'}</button></div>
    </form>
  </div>
}

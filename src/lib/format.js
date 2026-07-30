export function normalizeFrenchPhone(value = '') {
  let phone = value.replace(/\D/g, '')
  if (phone.startsWith('00')) phone = phone.slice(2)
  if (phone.startsWith('0')) phone = `33${phone.slice(1)}`
  if (phone.length === 9 && /^[67]/.test(phone)) phone = `33${phone}`
  return phone
}

export function isValidInternationalPhone(value) {
  return /^\d{10,15}$/.test(normalizeFrenchPhone(value))
}

export function formatDate(value, options = {}) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', options).format(new Date(`${value}T12:00:00`))
}

export const statusLabels = {
  draft: 'Brouillon', sent: 'Envoyée', filled: 'Pourvue', cancelled: 'Annulée',
  pending: 'En attente', failed: 'Échec', accepted: 'Accepté', declined: 'Indisponible', closed: 'Déjà pourvu',
}

export function buildSms(form, template = '') {
  if (!form.replacement_date) return 'Complétez la date et les horaires pour afficher l’aperçu.'
  const day = formatDate(form.replacement_date, { weekday: 'long', day: 'numeric', month: 'long' })
  const time = (value) => value?.slice(0, 5)?.replace(':', 'h') || ''
  const values = {
    date: day,
    debut: time(form.start_time),
    fin: time(form.end_time),
    etablissement: form.venue || 'à confirmer',
    adresse: form.address || '',
    cours: form.class_type || 'cours à confirmer',
    responsable: form.manager_name || '',
    telephone: form.manager_phone || '',
    commentaire: form.comment?.trim() || '',
  }
  if (template?.trim()) {
    return template.replace(/\{(date|debut|fin|etablissement|adresse|cours|responsable|telephone|commentaire)\}/g, (_, key) => values[key])
      .replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim()
  }
  const contact = values.responsable || values.telephone
    ? ` Contact : ${values.responsable}${values.responsable && values.telephone ? ' au ' : ''}${values.telephone}.`
    : ''
  const note = values.commentaire ? ` ${values.commentaire}` : ''
  return `Easy Replace — Remplacement disponible le ${day} de ${values.debut} à ${values.fin} à ${values.etablissement} pour un cours de ${values.cours}.${contact}${note}`.trim()
}

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

export function buildSms(form) {
  if (!form.replacement_date) return 'Complétez la date et les horaires pour afficher l’aperçu.'
  const day = formatDate(form.replacement_date, { weekday: 'long', day: 'numeric', month: 'long' })
  const time = (v) => v?.slice(0, 5)?.replace(':', 'h')
  const course = form.class_type ? ` pour un cours de ${form.class_type}` : ''
  const contact = form.manager_name || form.manager_phone
    ? ` Contact : ${form.manager_name || ''}${form.manager_name && form.manager_phone ? ' au ' : ''}${form.manager_phone || ''}.`
    : ''
  const note = form.comment ? ` ${form.comment.trim()}` : ''
  return `Easy Replace — Remplacement disponible le ${day} de ${time(form.start_time)} à ${time(form.end_time)} à ${form.venue || 'confirmer'}${course}.${contact}${note}`.trim()
}

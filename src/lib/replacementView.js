export function getReplacementDateTime(replacement) {
  if (!replacement?.replacement_date) return null
  const time = replacement.start_time?.slice(0, 5) || '00:00'
  const value = new Date(`${replacement.replacement_date}T${time}:00`)
  return Number.isNaN(value.getTime()) ? null : value
}

export function getReplacementCategory(replacement, now = new Date()) {
  const start = getReplacementDateTime(replacement)
  const isPast = start ? start.getTime() < now.getTime() : false

  if (replacement.status === 'cancelled' || isPast) return 'completed'
  if (replacement.status === 'filled' || replacement.accepted_recipient_id || replacement.accepted_coach_name) return 'filled'

  if (['draft', 'sent'].includes(replacement.status)) {
    if (start) {
      const hoursUntilStart = (start.getTime() - now.getTime()) / 3_600_000
      if (hoursUntilStart >= 0 && hoursUntilStart <= 24) return 'urgent'
    }
    return 'open'
  }

  return 'open'
}

export const categoryLabels = {
  urgent: 'Urgent',
  open: 'À pourvoir',
  filled: 'Pourvu',
  completed: 'Terminé',
}

export function getRecipientState(recipient) {
  if (recipient.response_status === 'accepted') return 'accepted'
  if (recipient.response_status === 'declined') return 'declined'
  if (recipient.response_status === 'closed') return 'closed'
  if (recipient.sms_status === 'failed') return 'failed'
  if (recipient.opened_at) return 'opened'
  return recipient.sms_status === 'sent' ? 'sent' : 'pending'
}

export const recipientStateLabels = {
  accepted: 'Accepté',
  declined: 'Indisponible',
  closed: 'Demande déjà pourvue',
  failed: 'SMS non distribué',
  opened: 'Lien ouvert',
  sent: 'SMS envoyé',
  pending: 'En attente',
}

export function buildTimeline(replacement) {
  const recipients = replacement.replacement_recipients || []
  const events = []

  if (replacement.created_at) {
    events.push({ at: replacement.created_at, type: 'created', title: 'Remplacement créé', detail: `${replacement.class_type} · ${replacement.venue}` })
  }

  const sentRecipients = recipients.filter((recipient) => recipient.sent_at)
  if (sentRecipients.length) {
    const firstSentAt = sentRecipients.map((recipient) => recipient.sent_at).sort()[0]
    events.push({ at: firstSentAt, type: 'sent', title: `${sentRecipients.length} SMS envoyé${sentRecipients.length > 1 ? 's' : ''}`, detail: 'Les coachs sélectionnés ont été contactés.' })
  }

  recipients.forEach((recipient) => {
    if (recipient.last_reminded_at) events.push({ at: recipient.last_reminded_at, type: 'reminded', title: `${recipient.coach_name_snapshot} a été relancé`, detail: `Relance n°${recipient.reminder_count || 1} envoyée.` })
    if (recipient.opened_at) events.push({ at: recipient.opened_at, type: 'opened', title: `${recipient.coach_name_snapshot} a ouvert le lien`, detail: 'La demande a été consultée.' })
    if (recipient.responded_at && recipient.response_status === 'declined') events.push({ at: recipient.responded_at, type: 'declined', title: `${recipient.coach_name_snapshot} a décliné`, detail: 'Le coach a indiqué être indisponible.' })
    if (recipient.responded_at && recipient.response_status === 'accepted') events.push({ at: recipient.responded_at, type: 'accepted', title: `${recipient.coach_name_snapshot} a accepté`, detail: 'Le remplacement a été attribué.' })
  })

  if (replacement.accepted_at && !events.some((event) => event.type === 'accepted' && event.at === replacement.accepted_at)) {
    events.push({ at: replacement.accepted_at, type: 'accepted', title: `${replacement.accepted_coach_name || 'Un coach'} a accepté`, detail: 'Le remplacement a été attribué.' })
  }

  return events.sort((a, b) => new Date(a.at) - new Date(b.at))
}

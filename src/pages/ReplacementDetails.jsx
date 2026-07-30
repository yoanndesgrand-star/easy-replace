import { useMemo, useState } from 'react'
import { formatDate } from '../lib/format'
import { buildTimeline, categoryLabels, getRecipientState, getReplacementCategory, recipientStateLabels } from '../lib/replacementView'

function formatEventTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export default function ReplacementDetails({ replacement, onBack, onDuplicate, onRemind }) {
  const [reminding, setReminding] = useState(false)
  const [notice, setNotice] = useState(null)

  const pendingRecipients = useMemo(() => (replacement?.replacement_recipients || []).filter((recipient) =>
    !['accepted', 'declined', 'closed'].includes(recipient.response_status),
  ), [replacement])

  if (!replacement) return null
  const category = getReplacementCategory(replacement)
  const timeline = buildTimeline(replacement)
  const recipients = replacement.replacement_recipients || []
  const canRemind = !['filled', 'cancelled'].includes(replacement.status) && !replacement.accepted_recipient_id && pendingRecipients.length > 0
  const fields = [
    ['Établissement', replacement.venue], ['Adresse', replacement.address || '—'],
    ['Date', formatDate(replacement.replacement_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
    ['Horaire', `${replacement.start_time?.slice(0, 5)} – ${replacement.end_time?.slice(0, 5)}`],
    ['Cours', replacement.class_type], ['Spécialité', replacement.required_specialty],
    ['Responsable', `${replacement.manager_name} · ${replacement.manager_phone}`],
  ]

  async function handleRemind() {
    const count = pendingRecipients.length
    const confirmed = window.confirm(`Relancer ${count} coach${count > 1 ? 's' : ''} sans réponse ?\n\nLes coachs ayant déjà accepté ou refusé ne seront pas contactés.`)
    if (!confirmed) return
    setReminding(true)
    setNotice(null)
    try {
      const result = await onRemind(replacement)
      setNotice({ type: result.failed ? 'warning' : 'success', text: result.failed ? `${result.sent} SMS envoyé(s), ${result.failed} échec(s).` : `${result.sent} SMS de relance envoyé(s).` })
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'La relance a échoué.' })
    } finally {
      setReminding(false)
    }
  }

  return <div className="page"><button className="back" onClick={onBack}>← Retour aux remplacements</button><header className="page-header detail-header"><div><p className="eyebrow">Détail du remplacement</p><h1>{replacement.class_type} · {replacement.venue}</h1><p>{formatDate(replacement.replacement_date, { weekday: 'long', day: 'numeric', month: 'long' })} · {replacement.start_time?.slice(0, 5)} – {replacement.end_time?.slice(0, 5)}</p><span className={`category-pill ${category}`}>{categoryLabels[category]}</span>{replacement.accepted_coach_name && <div className="filled-summary"><strong>✓ Pourvu par {replacement.accepted_coach_name}</strong>{replacement.accepted_at && <> · {new Date(replacement.accepted_at).toLocaleString('fr-FR')}</>}</div>}</div><div className="detail-actions"><button className="button secondary" onClick={() => onDuplicate(replacement)}>Dupliquer</button>{canRemind && <button className="button" disabled={reminding} onClick={handleRemind}>{reminding ? 'Envoi en cours…' : `Relancer (${pendingRecipients.length})`}</button>}</div></header>

    {notice && <div className={`inline-notice ${notice.type}`}>{notice.text}</div>}

    <div className="details-grid"><section className="card"><h2>Informations</h2><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="card"><h2>Message envoyé</h2><blockquote>{replacement.message}</blockquote></section></div>

    <div className="details-grid operational-grid"><section className="card"><div className="section-title"><div><h2>Chronologie</h2><p>L’activité de cette demande</p></div></div>{timeline.length ? <div className="timeline">{timeline.map((event, index) => <div className={`timeline-event ${event.type}`} key={`${event.at}-${event.type}-${index}`}><time>{formatEventTime(event.at)}</time><span className="timeline-dot"/><div><strong>{event.title}</strong><small>{event.detail}</small></div></div>)}</div> : <div className="empty">Aucun événement enregistré.</div>}</section>

    <section className="card"><div className="section-title"><div><h2>Coachs contactés</h2><p>{recipients.length} destinataire{recipients.length > 1 ? 's' : ''}</p></div></div><div className="recipient-cards">{recipients.map((recipient) => {
      const state = getRecipientState(recipient)
      const eventAt = recipient.responded_at || recipient.opened_at || recipient.last_reminded_at || recipient.sent_at
      return <article className={`recipient-card ${state}`} key={recipient.id}><div className="recipient-avatar">{recipient.coach_name_snapshot?.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div><strong>{recipient.coach_name_snapshot}</strong><small>{recipient.phone_snapshot}</small>{recipient.reminder_count > 0 && <small>{recipient.reminder_count} relance{recipient.reminder_count > 1 ? 's' : ''}</small>}</div><div className="recipient-result"><em className={`badge ${state}`}>{recipientStateLabels[state]}</em>{eventAt && <small>{formatEventTime(eventAt)}</small>}{recipient.error_message && <small className="danger-text">{recipient.error_message}</small>}</div></article>
    })}{!recipients.length && <div className="empty">Aucun coach contacté.</div>}</div></section></div>
  </div>
}

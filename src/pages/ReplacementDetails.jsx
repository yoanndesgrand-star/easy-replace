import { useMemo, useState } from 'react'
import { formatDate } from '../lib/format'
import { buildTimeline, categoryLabels, getRecipientState, getReplacementCategory, recipientStateLabels } from '../lib/replacementView'

function formatEventTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export default function ReplacementDetails({ replacement, coaches, onBack, onDuplicate, onEdit, onRemind, onCancel, onComplete, onArchive, onRestore, onAssign }) {
  const [reminding, setReminding] = useState(false)
  const [working, setWorking] = useState('')
  const [notice, setNotice] = useState(null)
  const [selectedCoachId, setSelectedCoachId] = useState('')

  const pendingRecipients = useMemo(() => (replacement?.replacement_recipients || []).filter((recipient) =>
    !['accepted', 'declined', 'closed'].includes(recipient.response_status),
  ), [replacement])

  if (!replacement) return null
  const category = getReplacementCategory(replacement)
  const timeline = buildTimeline(replacement)
  const recipients = replacement.replacement_recipients || []
  const archived = Boolean(replacement.archived_at)
  const isOpen = ['draft', 'sent'].includes(replacement.status) && !replacement.accepted_recipient_id && !archived
  const canRemind = isOpen && pendingRecipients.length > 0
  const canComplete = !archived && !['completed', 'cancelled'].includes(replacement.status)
  const activeCoaches = (coaches || []).filter((coach) => coach.is_active)
  const fields = [
    ['Établissement', replacement.venue], ['Adresse', replacement.address || '—'],
    ['Date', formatDate(replacement.replacement_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
    ['Horaire', `${replacement.start_time?.slice(0, 5)} – ${replacement.end_time?.slice(0, 5)}`],
    ['Cours', replacement.class_type], ['Spécialité', replacement.required_specialty],
    ['Responsable', `${replacement.manager_name} · ${replacement.manager_phone}`],
  ]

  async function runAction(name, confirmation, action, successText) {
    if (confirmation && !window.confirm(confirmation)) return
    setWorking(name)
    setNotice(null)
    try {
      await action()
      setNotice({ type: 'success', text: successText })
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'L’action a échoué.' })
    } finally { setWorking('') }
  }

  async function handleRemind() {
    const count = pendingRecipients.length
    if (!window.confirm(`Relancer ${count} coach${count > 1 ? 's' : ''} sans réponse ?\n\nLes coachs ayant déjà accepté ou refusé ne seront pas contactés.`)) return
    setReminding(true); setNotice(null)
    try {
      const result = await onRemind(replacement)
      setNotice({ type: result.failed ? 'warning' : 'success', text: result.failed ? `${result.sent} SMS envoyé(s), ${result.failed} échec(s).` : `${result.sent} SMS de relance envoyé(s).` })
    } catch (error) { setNotice({ type: 'error', text: error.message || 'La relance a échoué.' }) }
    finally { setReminding(false) }
  }

  async function handleAssign() {
    const coach = activeCoaches.find((item) => item.id === selectedCoachId)
    if (!coach) return setNotice({ type: 'error', text: 'Sélectionnez un coach.' })
    await runAction('assign', `Attribuer manuellement ce remplacement à ${coach.first_name} ${coach.last_name} ?\n\nLes autres liens de réponse seront fermés.`, () => onAssign(replacement, coach), 'Le remplacement a été attribué manuellement.')
  }

  return <div className="page"><button className="back" onClick={onBack}>← Retour aux remplacements</button>
    <header className="page-header detail-header"><div><p className="eyebrow">Détail du remplacement</p><h1>{replacement.class_type} · {replacement.venue}</h1><p>{formatDate(replacement.replacement_date, { weekday: 'long', day: 'numeric', month: 'long' })} · {replacement.start_time?.slice(0, 5)} – {replacement.end_time?.slice(0, 5)}</p><span className={`category-pill ${category}`}>{categoryLabels[category]}</span>{archived && <span className="category-pill archived">Archivé</span>}{replacement.accepted_coach_name && <div className="filled-summary"><strong>✓ Pourvu par {replacement.accepted_coach_name}</strong>{replacement.assignment_source === 'manual' && <> · attribution manuelle</>}{replacement.accepted_at && <> · {new Date(replacement.accepted_at).toLocaleString('fr-FR')}</>}</div>}</div>
      <div className="detail-actions"><button className="button secondary" onClick={() => onDuplicate(replacement)}>Dupliquer</button>{isOpen && <button className="button secondary" onClick={() => onEdit(replacement)}>Modifier</button>}{canRemind && <button className="button" disabled={reminding} onClick={handleRemind}>{reminding ? 'Envoi en cours…' : `Relancer (${pendingRecipients.length})`}</button>}</div>
    </header>

    {notice && <div className={`inline-notice ${notice.type}`}>{notice.text}</div>}

    <div className="details-grid"><section className="card"><h2>Informations</h2><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="card"><h2>Message enregistré</h2><blockquote>{replacement.message}</blockquote></section></div>

    {isOpen && <section className="card lifecycle-card"><div className="section-title"><div><h2>Attribuer manuellement</h2><p>À utiliser lorsque le coach a confirmé par téléphone ou par un autre moyen.</p></div></div><div className="manual-assignment"><select value={selectedCoachId} onChange={(event) => setSelectedCoachId(event.target.value)}><option value="">Choisir un coach actif…</option>{activeCoaches.map((coach) => <option value={coach.id} key={coach.id}>{coach.first_name} {coach.last_name} · {(coach.specialties || []).join(', ')}</option>)}</select><button className="button primary" disabled={working === 'assign'} onClick={handleAssign}>{working === 'assign' ? 'Attribution…' : 'Attribuer ce coach'}</button></div></section>}

    <div className="details-grid operational-grid"><section className="card"><div className="section-title"><div><h2>Chronologie</h2><p>L’activité de cette demande</p></div></div>{timeline.length ? <div className="timeline">{timeline.map((event, index) => <div className={`timeline-event ${event.type}`} key={`${event.at}-${event.type}-${index}`}><time>{formatEventTime(event.at)}</time><span className="timeline-dot"/><div><strong>{event.title}</strong><small>{event.detail}</small></div></div>)}</div> : <div className="empty">Aucun événement enregistré.</div>}</section>

    <section className="card"><div className="section-title"><div><h2>Coachs contactés</h2><p>{recipients.length} destinataire{recipients.length > 1 ? 's' : ''}</p></div></div><div className="recipient-cards">{recipients.map((recipient) => {
      const state = getRecipientState(recipient)
      const eventAt = recipient.responded_at || recipient.opened_at || recipient.last_reminded_at || recipient.sent_at
      return <article className={`recipient-card ${state}`} key={recipient.id}><div className="recipient-avatar">{recipient.coach_name_snapshot?.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div><strong>{recipient.coach_name_snapshot}</strong><small>{recipient.phone_snapshot}</small>{recipient.reminder_count > 0 && <small>{recipient.reminder_count} relance{recipient.reminder_count > 1 ? 's' : ''}</small>}</div><div className="recipient-result"><em className={`badge ${state}`}>{recipientStateLabels[state]}</em>{eventAt && <small>{formatEventTime(eventAt)}</small>}{recipient.error_message && <small className="danger-text">{recipient.error_message}</small>}</div></article>
    })}{!recipients.length && <div className="empty">Aucun coach contacté.</div>}</div></section></div>

    <section className="card danger-zone"><div><h2>Gestion de la demande</h2><p>Ces actions clôturent ou masquent le remplacement. Une confirmation est toujours demandée.</p></div><div className="lifecycle-actions">
      {archived ? <button className="button secondary" disabled={working === 'restore'} onClick={() => runAction('restore', null, () => onRestore(replacement), 'Le remplacement a été restauré.')}>{working === 'restore' ? 'Restauration…' : 'Restaurer'}</button> : <>
        {isOpen && <button className="button danger-outline" disabled={working === 'cancel'} onClick={() => runAction('cancel', 'Annuler ce remplacement ?\n\nTous les liens coach encore ouverts seront fermés.', () => onCancel(replacement), 'Le remplacement a été annulé.')}>{working === 'cancel' ? 'Annulation…' : 'Annuler le remplacement'}</button>}
        {canComplete && <button className="button secondary" disabled={working === 'complete'} onClick={() => runAction('complete', 'Marquer ce remplacement comme terminé ?', () => onComplete(replacement), 'Le remplacement est terminé.')}>{working === 'complete' ? 'Mise à jour…' : 'Marquer comme terminé'}</button>}
        <button className="button secondary" disabled={working === 'archive'} onClick={() => runAction('archive', 'Archiver ce remplacement ?\n\nIl sera retiré des listes actives mais restera conservé dans la base.', () => onArchive(replacement), 'Le remplacement a été archivé.')}>{working === 'archive' ? 'Archivage…' : 'Archiver'}</button>
      </>}
    </div></section>
  </div>
}

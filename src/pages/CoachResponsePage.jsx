import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'

export default function CoachResponsePage({ token }) {
  const [invitation, setInvitation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    let active = true
    supabase.rpc('get_replacement_invitation', { invitation_token: token })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setResult({ success: false, code: 'load_error', message: 'Impossible de charger cette demande.' })
        else setInvitation(data)
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [token])

  async function respond(decision) {
    setSubmitting(decision)
    const { data, error } = await supabase.rpc('respond_to_replacement_invitation', {
      invitation_token: token,
      decision,
    })
    setSubmitting('')
    if (error) setResult({ success: false, code: 'server_error', message: 'La réponse n’a pas pu être enregistrée.' })
    else setResult(data)
  }

  if (loading) return <PublicCard><div className="public-loader">Chargement de la demande…</div></PublicCard>
  if (!invitation?.valid) return <PublicCard><State icon="×" title="Lien invalide" text="Ce lien n’existe pas ou n’est plus disponible." tone="danger" /></PublicCard>

  const finalResult = result || getInitialState(invitation)
  if (finalResult) {
    const accepted = ['accepted', 'already_accepted'].includes(finalResult.code)
    const declined = ['declined', 'already_declined'].includes(finalResult.code)
    const title = accepted ? 'Remplacement confirmé' : declined ? 'Réponse enregistrée' : finalResult.code === 'already_filled' ? 'Remplacement déjà pourvu' : finalResult.code === 'cancelled' ? 'Demande annulée' : 'Demande indisponible'
    const text = accepted
      ? `Merci ${invitation.coachName}. La personne responsable est informée de votre acceptation.`
      : declined
        ? `Merci ${invitation.coachName}. Votre indisponibilité a été transmise.`
        : finalResult.message
    return <PublicCard><State icon={accepted ? '✓' : declined ? '✓' : 'i'} title={title} text={text} tone={accepted ? 'success' : declined ? 'neutral' : 'warning'} /></PublicCard>
  }

  return <PublicCard>
    <p className="eyebrow">Demande de remplacement</p>
    <h1>Bonjour {firstName(invitation.coachName)}</h1>
    <p className="public-intro">Êtes-vous disponible pour assurer ce remplacement&nbsp;?</p>
    <section className="invitation-summary">
      <div><span>Date</span><strong>{formatDate(invitation.replacementDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong></div>
      <div><span>Horaire</span><strong>{invitation.startTime?.slice(0, 5)} – {invitation.endTime?.slice(0, 5)}</strong></div>
      <div><span>Cours</span><strong>{invitation.classType}</strong></div>
      <div><span>Établissement</span><strong>{invitation.venue}</strong></div>
      {invitation.address && <div><span>Adresse</span><strong>{invitation.address}</strong></div>}
      <div><span>Contact</span><strong>{invitation.managerName} · {invitation.managerPhone}</strong></div>
    </section>
    <div className="response-actions">
      <button className="button primary response-primary" disabled={Boolean(submitting)} onClick={() => respond('accepted')}>{submitting === 'accepted' ? 'Validation…' : 'J’accepte le remplacement'}</button>
      <button className="button secondary" disabled={Boolean(submitting)} onClick={() => respond('declined')}>{submitting === 'declined' ? 'Enregistrement…' : 'Je ne suis pas disponible'}</button>
    </div>
    <p className="response-note">Le remplacement est attribué au premier coach qui l’accepte.</p>
  </PublicCard>
}

function getInitialState(invitation) {
  if (invitation.isCancelled) return { code: 'cancelled', message: 'Cette demande a été annulée.' }
  if (invitation.isCompleted) return { code: 'completed', message: 'Cette demande est terminée.' }
  if (invitation.isArchived) return { code: 'archived', message: 'Cette demande est clôturée.' }
  if (invitation.expired) return { code: 'expired', message: 'La date de ce remplacement est passée.' }
  if (invitation.isFilled && invitation.responseStatus !== 'accepted') return { code: 'already_filled', message: 'Un autre coach a déjà accepté cette demande.' }
  if (invitation.responseStatus === 'accepted') return { code: 'already_accepted', message: 'Ce remplacement vous est déjà attribué.' }
  if (invitation.responseStatus === 'declined') return { code: 'already_declined', message: 'Votre indisponibilité a déjà été enregistrée.' }
  return null
}

function PublicCard({ children }) {
  return <main className="public-response-page"><section className="public-response-card"><img src="/logo-transparent.png" className="public-logo" alt="Easy Replace" />{children}</section></main>
}

function State({ icon, title, text, tone }) {
  return <div className={`response-state ${tone}`}><span>{icon}</span><h1>{title}</h1><p>{text}</p></div>
}

function firstName(name = '') { return name.trim().split(/\s+/)[0] || '' }

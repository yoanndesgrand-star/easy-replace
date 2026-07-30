import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'

const stateCopy = {
  accepted: ['Remplacement confirmé', 'Vous avez accepté ce remplacement. La gérante en a été informée.'],
  declined: ['Réponse enregistrée', 'Vous avez indiqué ne pas être disponible pour ce remplacement.'],
  already_filled: ['Ce remplacement est déjà pourvu', 'Un autre coach a accepté cette demande. Merci pour votre disponibilité.'],
  cancelled: ['Demande annulée', 'La gérante a annulé cette demande de remplacement.'],
  expired: ['Lien expiré', 'Cette demande n’est plus disponible.'],
  invalid: ['Lien invalide', 'Ce lien est incorrect ou n’est plus utilisable.'],
}

export default function PublicResponsePage({ token }) {
  const [invitation, setInvitation] = useState(null)
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase.rpc('get_replacement_invitation', { p_token: token }).then(({ data, error: rpcError }) => {
      if (!active) return
      if (rpcError) { setError('Impossible de charger cette demande.'); setState('error'); return }
      setInvitation(data)
      setState(data?.state || 'invalid')
    })
    return () => { active = false }
  }, [token])

  async function respond(action) {
    setBusy(true); setError('')
    const functionName = action === 'accept' ? 'accept_replacement_invitation' : 'decline_replacement_invitation'
    const { data, error: rpcError } = await supabase.rpc(functionName, { p_token: token })
    if (rpcError) setError('Votre réponse n’a pas pu être enregistrée. Réessayez.')
    else setState(data?.state || 'invalid')
    setBusy(false)
  }

  if (state === 'loading') return <div className="public-response"><div className="response-card"><img src="/logo-transparent.png" alt="Easy Replace" /><div className="response-loader">Chargement de la demande…</div></div></div>
  if (state === 'error') return <div className="public-response"><div className="response-card"><img src="/logo-transparent.png" alt="Easy Replace" /><h1>Une erreur est survenue</h1><p>{error}</p></div></div>

  const replacement = invitation?.replacement
  const terminal = state !== 'available'
  const [title, description] = stateCopy[state] || stateCopy.invalid

  return <div className="public-response"><main className="response-card">
    <img src="/logo-transparent.png" alt="Easy Replace" />
    {terminal ? <>
      <div className={`response-icon ${state}`}>{state === 'accepted' ? '✓' : state === 'declined' ? '–' : '!'}</div>
      <h1>{title}</h1><p>{description}</p>
    </> : <>
      <p className="eyebrow">Demande de remplacement</p>
      <h1>Bonjour {invitation?.coachName?.split(' ')[0] || ''}</h1>
      <p>Êtes-vous disponible pour assurer ce remplacement ?</p>
      <section className="response-details">
        <div><span>Date</span><strong>{formatDate(replacement?.date, { weekday: 'long', day: 'numeric', month: 'long' })}</strong></div>
        <div><span>Horaire</span><strong>{replacement?.startTime?.slice(0, 5)} – {replacement?.endTime?.slice(0, 5)}</strong></div>
        <div><span>Cours</span><strong>{replacement?.classType}</strong></div>
        <div><span>Établissement</span><strong>{replacement?.venue}</strong>{replacement?.address && <small>{replacement.address}</small>}</div>
      </section>
      {error && <div className="notice error">{error}</div>}
      <button className="button primary response-accept" disabled={busy} onClick={() => respond('accept')}>{busy ? 'Validation…' : 'J’accepte le remplacement'}</button>
      <button className="button response-decline" disabled={busy} onClick={() => respond('decline')}>Je ne suis pas disponible</button>
      <p className="response-contact">Une question ? Contactez {replacement?.managerName} au {replacement?.managerPhone}.</p>
    </>}
  </main></div>
}

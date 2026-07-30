import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Notice from '../components/Notice'

const initialSignUp = { firstName: '', lastName: '', email: '', password: '', passwordConfirm: '', acceptsTerms: false }

export default function AuthPage() {
  const [mode, setMode] = useState('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signUp, setSignUp] = useState(initialSignUp)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function changeMode(nextMode) {
    setMode(nextMode); setError(''); setMessage(''); setPassword('')
  }

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'forgot') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
        if (authError) throw authError
        setMessage('Un lien de réinitialisation vient de vous être envoyé.')
      } else if (mode === 'sign-up') {
        if (signUp.password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.')
        if (signUp.password !== signUp.passwordConfirm) throw new Error('Les mots de passe ne correspondent pas.')
        if (!signUp.acceptsTerms) throw new Error('Vous devez accepter les conditions d’utilisation.')
        const firstName = signUp.firstName.trim()
        const lastName = signUp.lastName.trim()
        const { data, error: authError } = await supabase.auth.signUp({
          email: signUp.email.trim(),
          password: signUp.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}` },
          },
        })
        if (authError) throw authError
        // Une inscription ne doit jamais ouvrir directement l'application.
        if (data.session) await supabase.auth.signOut()
        setSignUp(initialSignUp)
        setMode('sign-in')
        setMessage('Compte créé. Consultez votre boîte e-mail et confirmez votre adresse avant de vous connecter.')
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) throw authError
        if (!data.user?.email_confirmed_at) {
          await supabase.auth.signOut()
          throw new Error('Confirmez votre adresse e-mail avant de vous connecter.')
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isSignUp = mode === 'sign-up'
  const isForgot = mode === 'forgot'
  return <div className="auth-page">
    <section className="auth-aside"><img className="auth-aside-logo" src="/logo-transparent.png" alt="Easy Replace" /><h1>Un remplacement trouvé, sans perdre de temps.</h1><p>Centralisez vos coachs et envoyez vos demandes en quelques instants.</p></section>
    <main className="auth-main"><form className="auth-card" onSubmit={submit}>
      <img className="auth-logo" src="/logo.png" alt="Easy Replace — Trouvez un remplaçant en moins d’une minute" />
      <p className="eyebrow">Espace administrateur</p>
      <h2>{isSignUp ? 'Créer mon compte' : isForgot ? 'Mot de passe oublié' : 'Ravi de vous revoir'}</h2>
      <p>{isSignUp ? 'Créez votre espace sécurisé. Vous devrez confirmer votre adresse e-mail.' : isForgot ? 'Saisissez votre e-mail pour recevoir un lien sécurisé.' : 'Connectez-vous pour gérer vos remplacements.'}</p>
      <Notice type="error">{error}</Notice><Notice type="success">{message}</Notice>

      {isSignUp ? <>
        <div className="auth-name-grid">
          <label>Prénom<input required autoComplete="given-name" value={signUp.firstName} onChange={(e) => setSignUp({ ...signUp, firstName: e.target.value })} /></label>
          <label>Nom<input required autoComplete="family-name" value={signUp.lastName} onChange={(e) => setSignUp({ ...signUp, lastName: e.target.value })} /></label>
        </div>
        <label>Adresse e-mail<input required type="email" autoComplete="email" value={signUp.email} onChange={(e) => setSignUp({ ...signUp, email: e.target.value })} /></label>
        <label>Mot de passe<input required minLength="8" type="password" autoComplete="new-password" value={signUp.password} onChange={(e) => setSignUp({ ...signUp, password: e.target.value })} /></label>
        <label>Confirmer le mot de passe<input required minLength="8" type="password" autoComplete="new-password" value={signUp.passwordConfirm} onChange={(e) => setSignUp({ ...signUp, passwordConfirm: e.target.value })} /></label>
        <label className="terms-check"><input required type="checkbox" checked={signUp.acceptsTerms} onChange={(e) => setSignUp({ ...signUp, acceptsTerms: e.target.checked })} /><span>J’accepte les conditions d’utilisation et la politique de confidentialité.</span></label>
      </> : <>
        <label>Adresse e-mail<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {!isForgot && <label>Mot de passe<input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
      </>}

      <button className="button primary full" disabled={loading}>{loading ? 'Veuillez patienter…' : isSignUp ? 'Créer mon compte' : isForgot ? 'Envoyer le lien' : 'Se connecter'}</button>
      {isSignUp
        ? <button type="button" className="link-button" onClick={() => changeMode('sign-in')}>J’ai déjà un compte · Se connecter</button>
        : isForgot
          ? <button type="button" className="link-button" onClick={() => changeMode('sign-in')}>Retour à la connexion</button>
          : <div className="auth-links"><button type="button" className="link-button" onClick={() => changeMode('forgot')}>Mot de passe oublié ?</button><button type="button" className="link-button signup-link" onClick={() => changeMode('sign-up')}>Créer mon compte</button></div>}
    </form></main>
  </div>
}

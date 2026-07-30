import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Notice from '../components/Notice'

export default function ResetPasswordPage({ onComplete }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    if (password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.')
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas.')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) return setError(updateError.message)
    await supabase.auth.signOut()
    window.history.replaceState({}, '', '/')
    onComplete()
  }
  return <div className="auth-page centered"><form className="auth-card" onSubmit={submit}><div className="brand"><span>ER</span><strong>Easy Replace</strong></div><p className="eyebrow">Sécurité</p><h2>Nouveau mot de passe</h2><p>Choisissez un mot de passe unique d’au moins 8 caractères.</p><Notice type="error">{error}</Notice>
    <label>Nouveau mot de passe<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    <label>Confirmer<input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
    <button className="button primary full">Enregistrer et revenir à la connexion</button></form></div>
}

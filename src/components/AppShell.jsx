const links = [
  ['dashboard', 'Tableau de bord', '⌂'],
  ['coaches', 'Coachs', '♙'],
  ['locations', 'Salles', '⌖'],
  ['replacement', 'Nouveau remplacement', '+'],
  ['replacements', 'Remplacements', '◷'],
  ['activity', 'Activité', '≋'],
  ['settings', 'Paramètres', '⚙'],
]

export default function AppShell({ page, navigate, onSignOut, children, settings }) {
  return <div className="app-layout">
    <aside>
      <button className="brand" onClick={() => navigate('dashboard')}><span>{settings?.logo_url ? <img src={settings.logo_url} alt="" /> : 'ER'}</span><strong>{settings?.establishment_name || 'Easy Replace'}</strong></button>
      <nav>{links.map(([id, label, icon]) =>
        <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)}>
          <i>{icon}</i>{label}
        </button>)}</nav>
      <button className="signout" onClick={onSignOut}>Se déconnecter</button>
    </aside>
    <main>{children}</main>
    <nav className="mobile-nav">{links.map(([id, label, icon]) =>
      <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)}>
        <i>{icon}</i><small>{label.replace('Nouveau remplacement', 'Nouveau')}</small>
      </button>)}</nav>
  </div>
}

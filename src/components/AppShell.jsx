const links = [
  ['dashboard', 'Tableau de bord', '⌂'],
  ['coaches', 'Coachs', '♙'],
  ['replacement', 'Nouveau remplacement', '+'],
  ['replacements', 'Remplacements', '◷'],
]

export default function AppShell({ page, navigate, onSignOut, children }) {
  return <div className="app-layout">
    <aside>
      <button className="brand" onClick={() => navigate('dashboard')}><span>ER</span><strong>Easy Replace</strong></button>
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

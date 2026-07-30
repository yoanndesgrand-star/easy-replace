export default function Notice({ type = 'info', children }) {
  if (!children) return null
  return <div className={`notice ${type}`} role="status">{children}</div>
}

import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Hoy', icon: 'today' },
  { to: '/plan', label: 'Plan', icon: 'plan' },
  { to: '/comida', label: 'Comida', icon: 'food' },
  { to: '/progreso', label: 'Progreso', icon: 'progress' },
  { to: '/coach', label: 'Coach', icon: 'coach' },
]

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Secciones">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name={t.icon} size={26} strokeWidth={1.7} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}

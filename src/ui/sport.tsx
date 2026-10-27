import { SPORT_LABEL, type Phase, type Sport } from '../domain/types'
import { Icon } from './Icon'

export const sportColor = (s: Sport) => `var(--${s})`
export const phaseColor = (p: Phase) => `var(--phase-${p})`

export function SportBadge({ sport, size = 36 }: { sport: Sport; size?: number }) {
  return (
    <span className="sport-badge" style={{ background: sportColor(sport), width: size, height: size, borderRadius: size * 0.28 }} aria-label={SPORT_LABEL[sport]}>
      <Icon name={sport} size={size * 0.6} strokeWidth={2} />
    </span>
  )
}

export function formatDistance(m?: number) {
  if (!m) return ''
  return m >= 1000 ? `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km` : `${m.toLocaleString('es-ES')} m`
}

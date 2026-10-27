import { motion, useReducedMotion } from 'motion/react'
import type { Macros } from '../../domain/nutrition/foods'
import type { DayType, Targets } from '../../domain/nutrition/targets'
import { spring } from '../../ui/motion'

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  rest: 'Día de descanso',
  short: 'Día de entreno',
  long: 'Día de sesión larga',
  race: 'Día de carrera',
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')

/** Anillo de kcal + barras de proteína, hidratos y grasa con lo que queda. */
export function MacroSummary({ targets, eaten, compact }: { targets: Targets; eaten: Macros; compact?: boolean }) {
  const left = targets.kcal - eaten.kcal
  const over = left < -targets.kcal * 0.05
  return (
    <div className="row" style={{ gap: 18, alignItems: 'center' }}>
      <Ring value={eaten.kcal} max={targets.kcal} size={compact ? 92 : 112} over={over}>
        <div className={compact ? 't-headline num' : 't-title3 num'}>{fmt(Math.abs(left))}</div>
        <div className="t-caption muted">{left >= 0 ? 'kcal quedan' : 'kcal de más'}</div>
      </Ring>
      <div className="grow stack" style={{ gap: compact ? 8 : 10 }}>
        <MacroBar label="Proteína" color="var(--macro-protein)" value={eaten.protein} target={targets.proteinG} />
        <MacroBar label="Hidratos" color="var(--macro-carbs)" value={eaten.carbs} target={targets.carbsG} />
        <MacroBar label="Grasa" color="var(--macro-fat)" value={eaten.fat} target={targets.fatG} />
      </div>
    </div>
  )
}

function MacroBar({ label, color, value, target }: { label: string; color: string; value: number; target: number }) {
  const pct = Math.min(1, target ? value / target : 0)
  return (
    <div className="stack" style={{ gap: 4 }} title={`${label}: ${fmt(value)} de ${fmt(target)} g`}>
      <div className="row-between">
        <span className="t-foot" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: 2, background: color, flex: 'none' }} aria-hidden />
          {label}
        </span>
        <span className="t-foot num muted">
          {fmt(value)} / {fmt(target)} g
        </span>
      </div>
      <div className="macro-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(value)}>
        <motion.div className="macro-fill" style={{ background: color }} initial={false} animate={{ width: `${pct * 100}%` }} transition={spring} />
      </div>
    </div>
  )
}

function Ring({ value, max, size, over, children }: { value: number; max: number; size: number; over: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(1, max ? value / max : 0)
  return (
    <div className="ring-wrap" style={{ width: size, height: size, flex: 'none' }} role="meter" aria-label="Calorías" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--red)' : 'var(--tint)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={reduce ? { duration: 0 } : spring}
        />
      </svg>
      <div className="center">{children}</div>
    </div>
  )
}

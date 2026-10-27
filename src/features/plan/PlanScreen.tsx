import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react'
import { useMemo, useState } from 'react'
import { db, type PlanSession, type PlanWeek } from '../../db/db'
import {
  addDays,
  diffDays,
  formatDate,
  formatDayLong,
  formatDayShort,
  formatMonth,
  mondayOf,
  PLAN_WEEKS,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  weekNumberFor,
  weekStart,
  type ISODate,
} from '../../domain/dates'
import { MILESTONES, PREP_EVENTS } from '../../domain/milestones'
import { fmtMin, phaseForWeek, weekLoadMin } from '../../domain/plan/generator'
import { PHASE_LABEL, type Phase } from '../../domain/types'
import { Pressable } from '../../ui/Button'
import { Segmented } from '../../ui/Controls'
import { Icon } from '../../ui/Icon'
import { project, spring } from '../../ui/motion'
import { Screen } from '../../ui/Screen'
import { formatDistance, phaseColor, sportColor, SportBadge } from '../../ui/sport'
import { usePlanContext } from '../hooks'
import { useSheets } from '../logs/useSheets'

type View = 'week' | 'month' | 'phases'

export function PlanScreen() {
  const { profile, today, planStart, currentWeek } = usePlanContext()
  const [view, setView] = useState<View>('week')
  const { open, sheets } = useSheets(planStart, today)
  const daysToRace = diffDays(profile.raceDate, today)

  return (
    <Screen title="Plan" eyebrow={`Faltan ${daysToRace} días · ${formatDate(profile.raceDate)}`}>
      <div className="stack-lg">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mes' },
            { value: 'phases', label: 'Fases e hitos' },
          ]}
        />
        {view === 'week' && <WeekView planStart={planStart} today={today} initialWeek={currentWeek ?? 1} onOpen={(s) => open('session', s)} />}
        {view === 'month' && <MonthView planStart={planStart} today={today} onOpen={(s) => open('session', s)} />}
        {view === 'phases' && <PhasesView planStart={planStart} currentWeek={currentWeek} />}
      </div>
      {sheets}
    </Screen>
  )
}

// ---------- Semana ----------

function WeekView({ planStart, today, initialWeek, onOpen }: { planStart: ISODate; today: ISODate; initialWeek: number; onOpen: (s: PlanSession) => void }) {
  const [n, setN] = useState(initialWeek)
  const [dir, setDir] = useState(0)
  const reduce = useReducedMotion()
  const data = useLiveQuery(async () => {
    const [info, sessions] = await Promise.all([db.planWeeks.where('weekNumber').equals(n).first(), db.planSessions.where('weekNumber').equals(n).sortBy('date')])
    return { info, sessions }
  }, [n])

  const go = (d: number) => {
    const next = Math.min(PLAN_WEEKS, Math.max(1, n + d))
    if (next === n) return
    setDir(d)
    setN(next)
  }

  // Deslizar con inercia: se decide por el punto proyectado, no por dónde se suelta.
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const projected = info.offset.x + project(info.velocity.x, 0.99)
    if (projected < -90) go(1)
    else if (projected > 90) go(-1)
  }

  const start = weekStart(planStart, n)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const sessions = data?.sessions ?? []
  const required = sessions.filter((s) => !s.optional && s.sport !== 'race')
  const done = required.filter((s) => s.status === 'done').length

  return (
    <div className="stack">
      <div className="row-between">
        <button className="icon-btn" onClick={() => go(-1)} disabled={n === 1} aria-label="Semana anterior">
          <Icon name="chevronLeft" size={20} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="t-headline num">
            Semana {n}
            {data?.info && <span style={{ color: phaseColor(data.info.phase) }}> · {PHASE_LABEL[data.info.phase]}</span>}
          </div>
          <div className="t-foot muted num">
            {formatDayShort(start)} – {formatDayShort(addDays(start, 6))}
          </div>
        </div>
        <button className="icon-btn" onClick={() => go(1)} disabled={n === PLAN_WEEKS} aria-label="Semana siguiente">
          <Icon name="chevronRight" size={20} />
        </button>
      </div>

      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div
          key={n}
          className="stack"
          initial={{ opacity: 0, x: reduce ? 0 : dir * 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reduce ? 0 : -dir * 60 }}
          transition={spring}
          drag={reduce ? false : 'x'}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.25}
          dragDirectionLock
          onDragEnd={onDragEnd}
          style={{ touchAction: 'pan-y' }}
        >
          <div className="card tight row wrap" style={{ gap: 8 }}>
            <span className="pill num">{fmtMin(weekLoadMin(sessions))} planificadas</span>
            <span className="pill num">
              {done}/{required.length} hechas
            </span>
            {data?.info?.isRecovery && <span className="pill" style={{ color: 'var(--green)' }}>Descarga</span>}
          </div>
          {data?.info?.notes && <div className="t-foot muted" style={{ padding: '0 4px' }}>{data.info.notes}</div>}

          <div className="group">
            {days.map((d, i) => {
              const ds = sessions.filter((s) => s.date === d)
              return (
                <div key={d} className="cell" style={{ alignItems: 'flex-start', background: d === today ? 'color-mix(in srgb, var(--tint) 8%, transparent)' : undefined }}>
                  <div style={{ width: 40, flex: 'none', paddingTop: 6 }}>
                    <div className="t-caption muted" style={{ textTransform: 'uppercase' }}>{WEEKDAYS[i].slice(0, 3)}</div>
                    <div className="t-title3 num" style={{ color: d === today ? 'var(--red)' : undefined }}>{Number(d.slice(8))}</div>
                  </div>
                  <div className="grow stack" style={{ gap: 4 }}>
                    {ds.length === 0 && <div className="t-sub faint" style={{ paddingTop: 10 }}>Descanso</div>}
                    {ds.map((s) => (
                      <SessionRow key={s.id} s={s} onClick={() => onOpen(s)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="t-foot muted" style={{ textAlign: 'center' }}>Desliza para cambiar de semana · toca una sesión para editarla o moverla</div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SessionRow({ s, onClick }: { s: PlanSession; onClick: () => void }) {
  return (
    <Pressable className="row" style={{ background: 'none', border: 0, padding: '6px 0', textAlign: 'left', width: '100%' }} onClick={onClick}>
      <SportBadge sport={s.sport} size={30} />
      <div className="grow">
        <div className={`t-callout ${s.status === 'skipped' ? 'status-skipped' : ''}`} style={{ fontWeight: 500 }}>
          {s.title}
          {s.optional && <span className="muted"> · opcional</span>}
        </div>
        <div className="t-foot muted num">{[fmtMin(s.durationMin), formatDistance(s.distanceM)].filter(Boolean).join(' · ')}</div>
      </div>
      {s.status === 'done' && <Icon name="check" size={20} strokeWidth={2.4} className="status-done" />}
      {s.test && s.status === 'planned' && <Icon name="flag" size={18} style={{ color: 'var(--orange)' }} />}
    </Pressable>
  )
}

// ---------- Mes ----------

function MonthView({ planStart, today, onOpen }: { planStart: ISODate; today: ISODate; onOpen: (s: PlanSession) => void }) {
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [selected, setSelected] = useState<ISODate>(today)
  const first = `${month}-01`
  const gridStart = mondayOf(first)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const sessions = useLiveQuery(() => db.planSessions.where('date').between(cells[0], cells[41], true, true).toArray(), [month]) ?? []
  const weeks = useLiveQuery(() => db.planWeeks.toArray())
  const weekByNumber = useMemo(() => new Map((weeks ?? []).map((w) => [w.weekNumber, w])), [weeks])

  const shiftMonth = (d: number) => {
    const [y, m] = month.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1 + d, 1))
    setMonth(dt.toISOString().slice(0, 7))
  }

  const selectedSessions = sessions.filter((s) => s.date === selected)
  const visibleCells = cells.slice(0, cells[35].slice(0, 7) === month ? 42 : 35)

  return (
    <div className="stack">
      <div className="row-between">
        <button className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="t-headline" style={{ textTransform: 'capitalize' }}>{formatMonth(first)}</div>
        <button className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
          <Icon name="chevronRight" size={20} />
        </button>
      </div>
      <div className="card" style={{ padding: 10 }}>
        <div className="month-grid">
          {WEEKDAYS_SHORT.map((d) => (
            <div key={d} className="dow t-caption muted">{d}</div>
          ))}
          {visibleCells.map((d) => {
            const wn = weekNumberFor(planStart, d)
            const w: PlanWeek | undefined = wn ? weekByNumber.get(wn) : undefined
            const ds = sessions.filter((s) => s.date === d)
            const tint = w ? `color-mix(in srgb, ${phaseColor(w.phase)} ${w.isRecovery ? 6 : 14}%, transparent)` : undefined
            return (
              <button
                key={d}
                className={`day-cell ${d === today ? 'today' : ''} ${d === selected ? 'selected' : ''} ${d.slice(0, 7) !== month ? 'out' : ''}`}
                style={{ background: d === selected ? undefined : tint }}
                onClick={() => setSelected(d)}
                aria-label={formatDayLong(d)}
              >
                <span className="n">{Number(d.slice(8))}</span>
                <span className="dots">
                  {ds.map((s) => (
                    <i key={s.id} style={{ background: sportColor(s.sport), opacity: s.status === 'skipped' ? 0.3 : 1 }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <PhaseLegend />
      <div className="t-section" style={{ padding: '8px 4px 0', textTransform: 'none', fontSize: '0.9375rem', color: 'var(--label)', fontWeight: 600 }}>
        {formatDayLong(selected)}
      </div>
      <div className="group" style={{ padding: '4px 16px' }}>
        {selectedSessions.length === 0 ? <div className="t-sub faint" style={{ padding: '10px 0' }}>Descanso</div> : selectedSessions.map((s) => <SessionRow key={s.id} s={s} onClick={() => onOpen(s)} />)}
      </div>
    </div>
  )
}

function PhaseLegend() {
  const phases: Phase[] = ['base', 'build1', 'build2', 'specific', 'taper', 'race']
  return (
    <div className="row wrap" style={{ gap: 10, padding: '0 4px' }}>
      {phases.map((p) => (
        <span key={p} className="row t-caption muted" style={{ gap: 4 }}>
          <span className="sport-dot" style={{ background: phaseColor(p) }} />
          {PHASE_LABEL[p]}
        </span>
      ))}
      <span className="t-caption muted">· más claro = descarga</span>
    </div>
  )
}

// ---------- Fases e hitos ----------

const PHASE_WEEKS: [Phase, number, number, string][] = [
  ['base', 1, 12, 'Hábito, técnica de natación, trote/caminata, fuerza básica, bici suave.'],
  ['build1', 13, 24, 'Carrera continua, bici más larga, 1.500 m de nado, primer tempo suave.'],
  ['build2', 25, 36, 'Sprint/10K de prueba, bici 3 h, carrera 12 km, aguas abiertas, bricks.'],
  ['specific', 37, 46, 'Bici larga 3-4 h, carrera larga 16-18 km, bricks, nutrición y ritmo 70.3.'],
  ['taper', 47, 50, 'Menos volumen, mantener toques de ritmo.'],
  ['race', 51, 51, 'Activación, logística, descanso. ¡A por ello!'],
]

function PhasesView({ planStart, currentWeek }: { planStart: ISODate; currentWeek: number | null }) {
  const cw = currentWeek ?? 0
  return (
    <div className="stack-lg">
      <section className="stack">
        {PHASE_WEEKS.map(([p, a, b, focus]) => {
          const active = cw >= a && cw <= b
          const progress = cw > b ? 1 : cw < a ? 0 : (cw - a + 1) / (b - a + 1)
          return (
            <div key={p} className="card stack" style={{ gap: 8, outline: active ? `2px solid ${phaseColor(p)}` : undefined }}>
              <div className="row-between">
                <div className="t-headline" style={{ color: phaseColor(p) }}>{PHASE_LABEL[p]}</div>
                <div className="t-foot muted num">
                  S{a}{b !== a && `–S${b}`} · {formatDayShort(weekStart(planStart, a))} – {formatDayShort(addDays(weekStart(planStart, b), 6))}
                </div>
              </div>
              <div className="t-sub muted">{focus}</div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress * 100}%`, background: phaseColor(p) }} />
              </div>
            </div>
          )
        })}
      </section>

      <section>
        <div className="group-title t-section">Hitos</div>
        <div className="group">
          {MILESTONES.map((m) => (
            <div key={m.key} className="cell" style={{ alignItems: 'flex-start' }}>
              <span className="pill num" style={{ background: m.week ? `color-mix(in srgb, ${phaseColor(phaseForWeek(m.week))} 18%, transparent)` : undefined, minWidth: 48, justifyContent: 'center' }}>
                {m.key}
              </span>
              <div className="grow">
                <div className="t-callout" style={{ fontWeight: 600 }}>{m.title}</div>
                <div className="t-foot muted num">{m.week ? `Semana ${m.week} · ${formatDayShort(weekStart(planStart, m.week))}` : 'Antes de la semana 1'}</div>
                <ul className="t-foot" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {m.criteria.map((c) => <li key={c}>{c}</li>)}
                  {m.weightRange && <li className="muted">Peso orientativo ≈ {m.weightRange[0]}-{m.weightRange[1]} kg</li>}
                </ul>
              </div>
            </div>
          ))}
        </div>
        <div className="group-foot t-foot muted">El estado de cada hito (adelantado / en camino / retrasado) se calculará con reglas en la Fase D.</div>
      </section>

      <section>
        <div className="group-title t-section">Pruebas de control</div>
        <div className="group">
          {[12, 24, 36, 46].map((w) => (
            <div key={w} className="cell">
              <Icon name="flag" size={18} style={{ color: 'var(--orange)' }} />
              <span className="grow t-callout">Semana {w}</span>
              <span className="value t-foot num">{formatDayShort(weekStart(planStart, w))}</span>
            </div>
          ))}
        </div>
        <div className="group-foot t-foot muted">Carrera 20' (distancia), natación 400 m (tiempo) y bici 30' (velocidad media).</div>
      </section>

      <section>
        <div className="group-title t-section">Carreras preparatorias</div>
        <div className="group">
          {PREP_EVENTS.map((e) => (
            <div key={e.title} className="cell">
              <span className="grow t-callout">{e.title}</span>
              <span className="value t-foot num">
                {formatDayShort(weekStart(planStart, e.weeks[0]))} – {formatDayShort(addDays(weekStart(planStart, e.weeks[1]), 6))}
              </span>
            </div>
          ))}
        </div>
        <div className="group-foot t-foot muted">Busca fechas reales en Andalucía o Valencia para estas ventanas. Opcional: aquatlón o duatlón en verano si no hace demasiado calor.</div>
      </section>
    </div>
  )
}


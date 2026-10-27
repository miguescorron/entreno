import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db, getSetting, type PlanSession, type Profile } from '../../db/db'
import { diffDays, formatDate, formatDayLong, type ISODate } from '../../domain/dates'
import { fmtMin } from '../../domain/plan/generator'
import { PHASE_LABEL } from '../../domain/types'
import { Button, Pressable } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { spring } from '../../ui/motion'
import { Screen } from '../../ui/Screen'
import { formatDistance, phaseColor, SportBadge } from '../../ui/sport'
import { AlarmBanner } from '../coach/AlarmBanner'
import { AlertsCard } from '../coach/AlertsCard'
import { WeeklyReviewCard } from '../progress/WeeklyReviewCard'
import { AddFoodSheet } from '../food/AddFoodSheet'
import { MacroSummary } from '../food/MacroSummary'
import { useDayNutrition, useNutritionBootstrap } from '../food/useNutrition'
import { usePlanContext } from '../hooks'
import { useSheets } from '../logs/useSheets'

export function TodayScreen() {
  const { profile, today, planStart, currentWeek } = usePlanContext()
  const { open, sheets } = useSheets(planStart, today)
  const navigate = useNavigate()
  const [addingFood, setAddingFood] = useState(false)
  const nutrition = useDayNutrition(today)
  useNutritionBootstrap()

  const todays = useLiveQuery(() => db.planSessions.where('date').equals(today).toArray(), [today])
  const week = useLiveQuery(async () => {
    const n = currentWeek ?? 1
    const [info, sessions] = await Promise.all([db.planWeeks.where('weekNumber').equals(n).first(), db.planSessions.where('weekNumber').equals(n).toArray()])
    return info ? { info, sessions } : undefined
  }, [currentWeek])
  const nextSession = useLiveQuery(
    () => db.planSessions.where('date').above(today).filter((s) => s.status === 'planned').first(),
    [today],
  )
  const checkin = useLiveQuery(() => db.checkins.where('date').equals(today).first(), [today])
  const lastWeight = useLiveQuery(() => db.bodyLogs.orderBy('date').last())

  const daysToRace = diffDays(profile.raceDate, today)
  const required = week?.sessions.filter((s) => !s.optional && s.sport !== 'race') ?? []
  const done = required.filter((s) => s.status === 'done').length

  return (
    <Screen
      title="Hoy"
      eyebrow={formatDayLong(today)}
      accessory={
        <Link to="/ajustes" className="icon-btn" aria-label="Ajustes">
          <Icon name="gear" size={22} />
        </Link>
      }
    >
      <div className="stack-lg">
        <DemoNotice />
        <AlarmBanner />
        {!profile.medicalCheckDone && <MedicalBanner profile={profile} />}
        <AlertsCard />
        <WeeklyReviewCard compact />

        {week && (
          <Pressable className="card" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => navigate('/plan')}>
            <div className="row-between">
              <div>
                <div className="t-headline num">
                  {currentWeek ? `Semana ${currentWeek}/51` : `Empieza el ${formatDate(planStart)}`}
                  <span style={{ color: phaseColor(week.info.phase) }}> · {PHASE_LABEL[week.info.phase]}</span>
                </div>
                <div className="t-sub muted num">
                  Sesiones {done}/{required.length}
                  {week.info.isRecovery && ' · Descarga'} · {daysToRace} días para la carrera
                </div>
              </div>
              <Icon name="chevronRight" size={18} className="chevron" />
            </div>
            <div className="progress-track" style={{ marginTop: 12 }}>
              <motion.div className="progress-fill" initial={false} animate={{ width: `${required.length ? (done / required.length) * 100 : 0}%` }} transition={spring} style={{ background: phaseColor(week.info.phase) }} />
            </div>
          </Pressable>
        )}

        <section className="stack">
          <div className="t-section" style={{ padding: '0 4px' }}>Entrenamiento</div>
          <AnimatePresence initial={false}>
            {todays === undefined ? null : todays.length === 0 ? (
              <RestCard key="rest" next={nextSession} onOpen={(s) => open('session', s)} />
            ) : (
              todays.map((s) => (
                <motion.div key={s.id} layout transition={spring}>
                  <SessionCard session={s} onDone={() => open('log', s)} onChange={() => open('session', s)} onSkip={() => open('skip', s)} />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </section>

        <section className="stack">
          <div className="t-section" style={{ padding: '0 4px' }}>Comida</div>
          <Pressable className="card" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => navigate('/comida')}>
            {nutrition.targets ? <MacroSummary targets={nutrition.targets} eaten={nutrition.eaten} compact /> : <div style={{ height: 92 }} />}
          </Pressable>
        </section>

        <section className="stack">
          <div className="t-section" style={{ padding: '0 4px' }}>Cómo estás</div>
          <Pressable className="card" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => open('checkin')}>
            {checkin ? (
              <div className="row-between">
                <div className="t-callout num">
                  {[
                    checkin.sleepHours != null && `😴 ${String(checkin.sleepHours).replace('.', ',')} h`,
                    checkin.energy && `⚡️ ${checkin.energy}/5`,
                    checkin.mood && `🙂 ${checkin.mood}/5`,
                    checkin.painLevel && `🩹 ${checkin.painZone} ${checkin.painLevel}/10`,
                  ]
                    .filter(Boolean)
                    .join('   ') || 'Check-in hecho'}
                </div>
                <span className="t-sub" style={{ color: 'var(--tint)' }}>Editar</span>
              </div>
            ) : (
              <div className="row-between">
                <div>
                  <div className="t-headline">Check-in de hoy</div>
                  <div className="t-sub muted">Sueño, energía, ánimo y molestias. 20 segundos.</div>
                </div>
                <Icon name="chevronRight" size={18} className="chevron" />
              </div>
            )}
          </Pressable>
          {lastWeight && (
            <div className="t-foot muted" style={{ padding: '0 4px' }}>
              {diffDays(today, lastWeight.date) >= 3 ? (
                <span style={{ color: 'var(--orange)' }}>Hace {diffDays(today, lastWeight.date)} días que no te pesas. </span>
              ) : null}
              Último peso: <span className="num">{lastWeight.weightKg.toLocaleString('es-ES')} kg</span> ({formatDate(lastWeight.date)}). Pésate en el check-in, mejor en ayunas.
            </div>
          )}
        </section>

        <section className="stack">
          <div className="t-section" style={{ padding: '0 4px' }}>Accesos rápidos</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <QuickAction icon="plus" label="Entreno extra" onClick={() => open('extra')} />
            <QuickAction icon="food" label="Añadir comida" onClick={() => setAddingFood(true)} />
            <QuickAction icon="coach" label="Coach" onClick={() => navigate('/coach')} />
          </div>
        </section>
      </div>
      {sheets}
      <AddFoodSheet open={addingFood} onClose={() => setAddingFood(false)} date={today} />
    </Screen>
  )
}

function SessionCard({ session: s, onDone, onChange, onSkip }: { session: PlanSession; onDone: () => void; onChange: () => void; onSkip: () => void }) {
  const meta = [fmtMin(s.durationMin), formatDistance(s.distanceM), `RPE ${s.intensityRpe}`].filter(Boolean).join(' · ')
  return (
    <div className="card stack" style={{ opacity: s.status === 'skipped' ? 0.6 : 1 }}>
      <Pressable className="row" style={{ alignItems: 'flex-start', background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={onChange}>
        <SportBadge sport={s.sport} size={44} />
        <div className="grow">
          <div className="t-headline">{s.title}</div>
          <div className="t-sub muted num">{meta}</div>
        </div>
        {s.status === 'done' && <Icon name="check" size={26} strokeWidth={2.4} className="status-done" />}
      </Pressable>
      <p className="t-callout" style={{ margin: 0 }}>{s.description}</p>
      <div className="row wrap" style={{ gap: 6 }}>
        {s.test && <span className="pill">Prueba de control</span>}
        {s.key && !s.test && <span className="pill">Sesión clave</span>}
        {s.optional && <span className="pill">Opcional</span>}
      </div>
      {s.status === 'planned' ? (
        <div className="stack" style={{ gap: 8 }}>
          <Button variant="filled block" onClick={onDone}>
            <Icon name="check" size={20} strokeWidth={2.4} /> Hecho
          </Button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button onClick={onChange}>Cambiar</Button>
            <Button onClick={onSkip}>No he podido</Button>
          </div>
        </div>
      ) : (
        <div className="t-sub muted">{s.status === 'done' ? '¡Hecho! Buen trabajo.' : 'Marcada como no hecha.'} Toca la sesión para deshacer.</div>
      )}
    </div>
  )
}

function RestCard({ next, onOpen }: { next?: PlanSession; onOpen: (s: PlanSession) => void }) {
  return (
    <motion.div className="card stack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
      <div className="row">
        <span style={{ fontSize: 32 }} aria-hidden>🌿</span>
        <div>
          <div className="t-headline">Descanso</div>
          <div className="t-sub muted">El descanso también es entrenamiento. Camina, estira y duerme bien.</div>
        </div>
      </div>
      {next && (
        <Pressable className="cell" style={{ background: 'var(--fill)', borderRadius: 12 }} onClick={() => onOpen(next)}>
          <SportBadge sport={next.sport} size={28} />
          <span className="grow t-sub">
            Próxima: <b>{next.title}</b> · {formatDayLong(next.date as ISODate)}
          </span>
        </Pressable>
      )}
    </motion.div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: 'plus' | 'food' | 'coach'; label: string; onClick: () => void }) {
  return (
    <Pressable className="card" style={{ border: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px', color: 'var(--tint)' }} onClick={onClick}>
      <Icon name={icon} size={24} />
      <span className="t-foot" style={{ color: 'var(--label)', fontWeight: 500 }}>{label}</span>
    </Pressable>
  )
}

function DemoNotice() {
  const demo = useLiveQuery(() => getSetting('demo', false))
  if (!demo) return null
  return (
    <div className="banner" style={{ background: 'color-mix(in srgb, var(--tint) 12%, var(--bg-elevated))' }}>
      <Icon name="warning" size={18} style={{ color: 'var(--tint)', flex: 'none' }} />
      <span className="t-sub">
        <b>Vista previa con datos de ejemplo.</b> El plan está adelantado 5 semanas para que veas gráficos con historia. La IA y el código de barras no funcionan aquí.
      </span>
    </div>
  )
}

function MedicalBanner({ profile }: { profile: Profile }) {
  return (
    <div className="banner">
      <span style={{ fontSize: 20 }} aria-hidden>⚕️</span>
      <div className="grow stack" style={{ gap: 8 }}>
        <span className="t-sub">
          <b>Hito H0:</b> hazte un chequeo médico con prueba de esfuerzo antes de empezar a entrenar en serio.
        </span>
        <Button variant="small tinted" style={{ alignSelf: 'flex-start' }} onClick={() => db.profile.update(profile.id!, { medicalCheckDone: true })}>
          Ya lo he hecho
        </Button>
      </div>
    </div>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../db/db'
import { milestoneStatus, SPORT_GROUPS, weeklyStats, weightSeries, type SportGroup, type WeekStats } from '../../db/progress'
import { addDays, formatDate, formatDayShort, parseISO, toISO, weekStart } from '../../domain/dates'
import { MILESTONES } from '../../domain/milestones'
import type { Light, MilestoneEvaluation, MilestoneStatus } from '../../domain/progress/rules'
import { TEST_LABEL } from '../../domain/types'
import { Button } from '../../ui/Button'
import { BarChart, ChartTable, Legend, LineChart } from '../../ui/charts'
import { Group, Segmented } from '../../ui/Controls'
import { Icon } from '../../ui/Icon'
import { Screen } from '../../ui/Screen'
import { usePlanContext } from '../hooks'
import { TestResultSheet } from './TestResultSheet'
import { WeeklyReviewCard } from './WeeklyReviewCard'

type Range = '8' | '16' | 'all'

const GROUP_LABEL: Record<SportGroup, string> = { swim: 'Natación', bike: 'Bici', strength: 'Fuerza', run: 'Carrera', other: 'Otros' }
const GROUP_COLOR: Record<SportGroup, string> = { swim: 'var(--swim)', bike: 'var(--bike)', strength: 'var(--strength)', run: 'var(--run)', other: 'var(--other)' }

export const LIGHT_LABEL: Record<Light, string> = { green: 'Verde', yellow: 'Amarillo', red: 'Rojo', none: 'Sin datos' }
export const LIGHT_COLOR: Record<Light, string> = { green: 'var(--green)', yellow: 'var(--orange)', red: 'var(--red)', none: 'var(--label-3)' }

const STATUS: Record<MilestoneStatus, { label: string; color: string }> = {
  done: { label: 'Cumplido', color: 'var(--green)' },
  ahead: { label: 'Adelantado', color: 'var(--green)' },
  on_track: { label: 'En camino', color: 'var(--tint)' },
  in_progress: { label: 'En curso', color: 'var(--label-2)' },
  behind: { label: 'Retrasado', color: 'var(--orange)' },
  future: { label: 'Más adelante', color: 'var(--label-3)' },
}

const dayX = (d: string) => parseISO(d).getTime() / 86_400_000
const xToDate = (x: number) => toISO(new Date(x * 86_400_000))
const kg = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg`
const hours = (min: number) => `${(min / 60).toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`

export function ProgressScreen() {
  const { profile, today, planStart, currentWeek, planWeeks } = usePlanContext()
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>('8')
  const [volume, setVolume] = useState<'h' | 'km'>('h')
  const [addingTest, setAddingTest] = useState(false)

  const stats = useLiveQuery(() => weeklyStats(profile, today), [profile, today])
  const weight = useLiveQuery(() => weightSeries(profile, today), [profile, today])
  const milestones = useLiveQuery(() => milestoneStatus(profile, today), [profile, today])
  const tests = useLiveQuery(() => db.testResults.orderBy('date').reverse().toArray()) ?? []

  const visible = useMemo(() => {
    const all = stats ?? []
    return range === 'all' ? all : all.slice(-Number(range))
  }, [stats, range])
  const thisWeek = stats?.at(-1)
  const last4 = (stats ?? []).slice(-4)
  const adh4 = last4.reduce((a, w) => a + w.required, 0) ? Math.round((last4.reduce((a, w) => a + w.done, 0) / last4.reduce((a, w) => a + w.required, 0)) * 100) : null
  // El peso puede venir de antes del plan: se filtra por días desde hoy
  const fromDate = range === 'all' ? undefined : addDays(today, -7 * Number(range))
  const askCoach = (text: string) => navigate('/coach', { state: { draft: text } })

  return (
    <Screen title="Progreso" eyebrow={currentWeek ? `Semana ${currentWeek}/${planWeeks}` : `Empieza el ${formatDate(planStart)}`}>
      <div className="stack-lg">
        <Segmented value={range} onChange={setRange} options={[{ value: '8', label: '8 semanas' }, { value: '16', label: '16 semanas' }, { value: 'all', label: 'Todo' }]} />

        {thisWeek && <LightCard w={thisWeek} onAsk={askCoach} />}

        <WeeklyReviewCard />

        <div className="card row" style={{ justifyContent: 'space-around', textAlign: 'center' }}>
          <Stat label="Peso (media 7 d)" value={weight ? kg(weight.currentKg) : '—'} sub={weight ? `${weight.currentKg - profile.startWeightKg > 0 ? '+' : ''}${(weight.currentKg - profile.startWeightKg).toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg desde el inicio` : ''} />
          <Stat label="Adherencia 4 sem" value={adh4 != null ? `${adh4} %` : '—'} />
          <Stat label="Esta semana" value={thisWeek ? hours(SPORT_GROUPS.reduce((a, g) => a + thisWeek.minutes[g], 0)) : '—'} sub={thisWeek ? `de ${hours(thisWeek.plannedMin)}` : ''} />
        </div>

        <ChartCard title="Peso" subtitle="Puntos: cada pesada · línea: media de 7 días">
          {weight && (
            <>
              <Legend items={[{ label: 'Pesada', color: 'var(--label-3)', shape: 'dot' }, { label: 'Media 7 días', color: 'var(--tint)', shape: 'line' }, { label: 'Objetivo', color: 'var(--green)', shape: 'line' }]} />
              <LineChart
                series={[
                  { key: 'raw', label: 'Pesada', color: 'var(--label-3)', kind: 'dots', points: weight.points.filter((p) => !fromDate || p.date >= fromDate).map((p) => ({ x: dayX(p.date), y: p.kg })) },
                  { key: 'ma', label: 'Media 7 días', color: 'var(--tint)', kind: 'line', points: weight.average.filter((p) => !fromDate || p.date >= fromDate).map((p) => ({ x: dayX(p.date), y: p.kg })) },
                ]}
                refLines={[{ y: profile.goalWeightKg, label: `Objetivo ${profile.goalWeightKg} kg`, color: 'var(--green)' }]}
                xLabel={(x) => formatDayShort(xToDate(x))}
                yFormat={(n) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })}
              />
              <ProjectionText weight={weight} currentWeek={currentWeek ?? 1} goal={profile.goalWeightKg} />
              <ChartTable head={['Fecha', 'Peso', 'Media 7 d']} rows={weight.points.slice(-30).reverse().map((p) => [formatDate(p.date), kg(p.kg), kg(weight.average.find((a) => a.date === p.date)?.kg ?? p.kg)])} />
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Volumen semanal"
          action={<Segmented value={volume} onChange={setVolume} options={[{ value: 'h', label: 'Horas' }, { value: 'km', label: 'Km' }]} />}
        >
          <Legend items={SPORT_GROUPS.map((g) => ({ label: GROUP_LABEL[g], color: GROUP_COLOR[g], shape: 'rect' as const }))} />
          <BarChart
            data={visible.map((w) => ({
              label: `S${w.week}`,
              title: `Semana ${w.week}`,
              note: w.isRecovery ? 'descarga' : undefined,
              faded: w.week === currentWeek,
              values: Object.fromEntries(SPORT_GROUPS.map((g) => [g, volume === 'h' ? w.minutes[g] / 60 : w.km[g]])),
            }))}
            series={SPORT_GROUPS.map((g) => ({ key: g, label: GROUP_LABEL[g], color: GROUP_COLOR[g] }))}
            yFormat={(n) => (volume === 'h' ? `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h` : `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`)}
          />
          <div className="t-foot muted">La semana en curso aparece más clara.</div>
          <ChartTable
            head={['Semana', ...SPORT_GROUPS.map((g) => GROUP_LABEL[g])]}
            rows={visible.map((w) => [`S${w.week}`, ...SPORT_GROUPS.map((g) => (volume === 'h' ? hours(w.minutes[g]) : `${w.km[g].toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`))])}
          />
        </ChartCard>

        <ChartCard title="Carga semanal" subtitle="Horas × esfuerzo medio (RPE). Sube como mucho un 10 % por semana.">
          <BarChart
            data={visible.map((w) => ({ label: `S${w.week}`, title: `Semana ${w.week}`, faded: w.week === currentWeek, note: w.avgRpe ? `RPE medio ${w.avgRpe.toLocaleString('es-ES')}` : undefined, values: { load: w.load } }))}
            series={[{ key: 'load', label: 'carga', color: 'var(--tint)' }]}
          />
          <ChartTable head={['Semana', 'Carga', 'RPE medio']} rows={visible.map((w) => [`S${w.week}`, w.load.toLocaleString('es-ES'), w.avgRpe?.toLocaleString('es-ES') ?? '—'])} />
        </ChartCard>

        <Group title="Semáforo y adherencia" foot="Verde ≥ 80 % de sesiones; amarillo 60-79 % o fatiga alta; rojo < 60 %, dolor persistente o señal de alarma.">
          {[...visible].reverse().map((w) => (
            <div key={w.week} className="cell">
              <span className="light-dot" style={{ background: LIGHT_COLOR[w.light.light] }} aria-hidden />
              <div className="grow">
                <div className="t-callout num">
                  Semana {w.week} · {LIGHT_LABEL[w.light.light]}
                  {w.isRecovery && <span className="muted"> · descarga</span>}
                </div>
                <div className="t-foot muted">{w.light.reasons.join(' · ') || w.light.advice}</div>
              </div>
              <span className="t-callout num">{w.required ? `${w.done}/${w.required}` : '—'}</span>
            </div>
          ))}
        </Group>

        <ChartCard title="Sueño y energía" subtitle="Medias semanales de los check-ins">
          <div className="t-foot muted" style={{ marginBottom: 2 }}>Sueño (horas)</div>
          <LineChart height={120} series={[{ key: 'sleep', label: 'Sueño', color: 'var(--indigo)', kind: 'line', points: visible.filter((w) => w.avgSleep != null).map((w) => ({ x: w.week, y: Math.round(w.avgSleep! * 10) / 10 })) }]} xLabel={(x) => `S${x}`} />
          <div className="t-foot muted" style={{ margin: '10px 0 2px' }}>Energía (1-5)</div>
          <LineChart height={120} yDomain={[1, 5]} series={[{ key: 'energy', label: 'Energía', color: 'var(--teal)', kind: 'line', points: visible.filter((w) => w.avgEnergy != null).map((w) => ({ x: w.week, y: Math.round(w.avgEnergy! * 10) / 10 })) }]} xLabel={(x) => `S${x}`} />
        </ChartCard>

        <Group title="Comida (media por día registrado)">
          {[...visible].reverse().filter((w) => w.avgKcal != null).slice(0, 8).map((w) => (
            <div key={w.week} className="cell">
              <span className="grow t-callout num">Semana {w.week}</span>
              <span className="value t-foot num">{w.avgKcal?.toLocaleString('es-ES')} kcal · {w.avgProtein} g proteína</span>
            </div>
          ))}
          {!visible.some((w) => w.avgKcal != null) && <div className="cell t-sub muted">Aún no hay comidas registradas.</div>}
        </Group>

        <section className="stack">
          <div className="group-title t-section">Hitos</div>
          {(milestones ?? []).filter((m) => m.status !== 'future').map((m) => (
            <MilestoneCard key={m.key} m={m} date={m.week ? formatDayShort(weekStart(planStart, m.week)) : 'Antes de empezar'} onAsk={askCoach} />
          ))}
          {(milestones ?? []).some((m) => m.status === 'future') && (
            <div className="t-foot muted" style={{ padding: '0 4px' }}>
              Más adelante: {(milestones ?? []).filter((m) => m.status === 'future').map((m) => `${m.key} (S${m.week})`).join(', ')}.
            </div>
          )}
        </section>

        <section>
          <div className="group-title row-between">
            <span className="t-section">Pruebas de control y marcas</span>
            <Button variant="small plain" onClick={() => setAddingTest(true)}>
              <Icon name="plus" size={16} /> Añadir
            </Button>
          </div>
          <div className="group">
            {tests.length === 0 && <div className="cell t-sub muted">Apunta aquí los tests de las semanas 12, 24, 36 y 46, y tus marcas (minutos corriendo seguidos, metros nadando sin parar, aguas abiertas).</div>}
            {tests.map((t) => (
              <div key={t.id} className="cell">
                <div className="grow">
                  <div className="t-callout">{TEST_LABEL[t.type].label}</div>
                  <div className="t-foot muted">{formatDate(t.date)}{t.note ? ` · ${t.note}` : ''}</div>
                </div>
                <span className="t-callout num">{formatTest(t.type, t.value)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <TestResultSheet open={addingTest} onClose={() => setAddingTest(false)} today={today} />
    </Screen>
  )
}

export function formatTest(type: keyof typeof TEST_LABEL, v: number) {
  if (type === 'swim400') return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`
  return `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} ${TEST_LABEL[type].unit}`
}

function ChartCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="t-headline">{title}</div>
          {subtitle && <div className="t-foot muted">{subtitle}</div>}
        </div>
        {action && <div style={{ width: 140 }}>{action}</div>}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="t-title3">{value}</div>
      <div className="t-caption muted">{label}</div>
      {sub && <div className="t-caption faint">{sub}</div>}
    </div>
  )
}

function LightCard({ w, onAsk }: { w: WeekStats; onAsk: (t: string) => void }) {
  const l = w.light
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row">
        <span className="light-dot" style={{ background: LIGHT_COLOR[l.light], width: 16, height: 16 }} aria-hidden />
        <div className="grow">
          <div className="t-headline">Semáforo de la semana: {LIGHT_LABEL[l.light].toLowerCase()}</div>
          <div className="t-foot muted">{l.reasons.join(' · ')}</div>
        </div>
      </div>
      <div className="t-sub">{l.advice}</div>
      {(l.light === 'yellow' || l.light === 'red') && (
        <Button variant="small tinted" style={{ alignSelf: 'flex-start' }} onClick={() => onAsk(`El semáforo de esta semana está en ${LIGHT_LABEL[l.light].toLowerCase()} (${l.reasons.join(', ')}). ¿Qué ajustamos?`)}>
          Pedir ajuste al coach
        </Button>
      )}
    </div>
  )
}

function ProjectionText({ weight, currentWeek, goal }: { weight: NonNullable<Awaited<ReturnType<typeof weightSeries>>>; currentWeek: number; goal: number }) {
  const p = weight.projection
  if (!p) return <div className="t-foot muted">Pésate 3-4 veces por semana para ver la proyección.</div>
  const next = MILESTONES.find((m) => m.week > currentWeek && m.weightRange)
  const rate = p.slopePerWeek.toLocaleString('es-ES', { maximumFractionDigits: 2, signDisplay: 'always' })
  return (
    <div className="t-foot">
      A este ritmo ({rate} kg/semana){' '}
      {p.goalWeek ? (p.goalWeek <= currentWeek ? 'ya estás en tu peso objetivo.' : `llegas a ${goal} kg en la semana ${p.goalWeek}.`) : 'no llegas al peso objetivo antes de la carrera (y no pasa nada: el objetivo es terminar sano).'}
      {next && ` En la semana ${next.week} (${next.key}) estarías en ${kg(p.weightAt(next.week))}; la referencia es ${next.weightRange![0]}-${next.weightRange![1]} kg.`}
    </div>
  )
}

function MilestoneCard({ m, date, onAsk }: { m: MilestoneEvaluation; date: string; onAsk: (t: string) => void }) {
  const def = MILESTONES.find((x) => x.key === m.key)!
  const st = STATUS[m.status]
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="t-headline">
            {m.key} · {def.title}
          </div>
          <div className="t-foot muted">{m.week ? `Semana ${m.week} · ${date}` : date}</div>
        </div>
        <span className="pill" style={{ color: st.color, background: `color-mix(in srgb, ${st.color} 14%, transparent)` }}>
          {st.label}
        </span>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        {m.criteria.map((c) => (
          <div key={c.label} className="row t-sub" style={{ gap: 8 }}>
            <Icon name={c.met ? 'check' : 'close'} size={16} strokeWidth={2.4} style={{ color: c.met ? 'var(--green)' : 'var(--label-3)', flex: 'none' }} />
            <span className={c.met ? '' : 'muted'}>{c.label}</span>
          </div>
        ))}
      </div>
      <div className="t-foot muted">{m.reason}</div>
      {m.status === 'behind' && (
        <Button variant="small tinted" style={{ alignSelf: 'flex-start' }} onClick={() => onAsk(`El hito ${m.key} (${def.title}) va retrasado: ${m.reason} ¿Repetimos bloque, bajamos volumen o movemos el hito?`)}>
          Hablar con el coach
        </Button>
      )}
    </div>
  )
}

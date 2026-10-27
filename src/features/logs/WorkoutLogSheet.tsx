import { useEffect, useState } from 'react'
import { db, type PlanSession, type WorkoutLog } from '../../db/db'
import { acknowledgeAlerts, currentAlerts, newAlerts, raiseAlarm } from '../../db/guardrails'
import { logWorkout } from '../../db/plan'
import { detectAlarmSignals, type Alert } from '../../domain/guardrails/ambition'
import { useCurrentProfile, useToday } from '../hooks'
import { formatDayLong, type ISODate } from '../../domain/dates'
import { SPORT_LABEL, type Sport } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Chips, Field, NumberInput, Rating } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

const SPORTS: Sport[] = ['swim', 'bike', 'run', 'walk', 'strength', 'brick', 'other']
export const PAIN_ZONES = ['Rodilla', 'Gemelo', 'Tobillo', 'Pie', 'Cadera', 'Espalda', 'Hombro', 'Otra']
const WEATHER = ['Normal', 'Calor', 'Frío', 'Lluvia', 'Viento']

export const RPE_LABEL: Record<number, string> = {
  1: 'Reposo',
  2: 'Muy suave',
  3: 'Suave',
  4: 'Cómodo, puedo hablar',
  5: 'Moderado',
  6: 'Algo duro, frases cortas',
  7: 'Duro',
  8: 'Muy duro',
  9: 'Casi al máximo',
  10: 'Máximo',
}

interface Props {
  open: boolean
  onClose: () => void
  session?: PlanSession
  date: ISODate
}

type Draft = {
  sport: Sport
  durationMin?: number
  distance?: number
  avgHr?: number
  rpe: number
  feelingText: string
  painZone?: string
  painLevel?: number
  weather?: string
  bikeMin?: number
  runMin?: number
}

function initialDraft(session?: PlanSession): Draft {
  const seg = session?.structure?.kind === 'segments' ? session.structure.segments : undefined
  return {
    sport: session?.sport === 'race' ? 'other' : session?.sport ?? 'run',
    durationMin: session?.durationMin,
    distance: session?.distanceM ? (session.sport === 'swim' ? session.distanceM : session.distanceM / 1000) : undefined,
    rpe: session?.intensityRpe ?? 4,
    feelingText: '',
    bikeMin: seg?.find((s) => s.sport === 'bike')?.durationMin,
    runMin: seg?.find((s) => s.sport === 'run')?.durationMin,
  }
}

export function WorkoutLogSheet({ open, onClose, session, date }: Props) {
  const [d, setD] = useState<Draft>(() => initialDraft(session))
  const [confirm, setConfirm] = useState<{ alerts: Alert[]; logId: number } | null>(null)
  const toast = useToast()
  const profile = useCurrentProfile()
  const today = useToday()
  useEffect(() => {
    if (open) {
      setD(initialDraft(session))
      setConfirm(null)
    }
  }, [open, session])

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const isBrick = d.sport === 'brick'
  const duration = isBrick ? (d.bikeMin ?? 0) + (d.runMin ?? 0) : d.durationMin ?? 0
  const distUnit = d.sport === 'swim' ? 'm' : 'km'

  const save = async () => {
    const log: Omit<WorkoutLog, 'id' | 'createdAt'> = {
      planSessionId: session?.id,
      date,
      sport: d.sport,
      durationMin: duration,
      distanceM: d.distance ? Math.round(d.sport === 'swim' ? d.distance : d.distance * 1000) : undefined,
      avgHr: d.avgHr,
      rpe: d.rpe,
      feelingText: d.feelingText.trim() || undefined,
      painZone: d.painLevel ? d.painZone : undefined,
      painLevel: d.painLevel,
      weatherNote: d.weather,
      segments: isBrick
        ? [
            { sport: 'bike', durationMin: d.bikeMin ?? 0 },
            { sport: 'run', durationMin: d.runMin ?? 0 },
          ]
        : undefined,
      isExtra: !session,
    }
    const before = await currentAlerts(profile, today)
    const id = await logWorkout(log)
    if (log.feelingText) {
      const symptoms = detectAlarmSignals(log.feelingText)
      if (symptoms.length) await raiseAlarm(symptoms, log.feelingText)
    }
    // Freno de ambición: si este registro dispara alertas nuevas, se pide confirmación explícita
    const fresh = newAlerts(before, await currentAlerts(profile, today))
    if (fresh.length) {
      setConfirm({ alerts: fresh, logId: id })
      return
    }
    onClose()
    const pain = log.painLevel ? `, molestia ${log.painZone?.toLowerCase() ?? ''} ${log.painLevel}/10` : ''
    toast(`Guardado: ${SPORT_LABEL[d.sport].toLowerCase()} ${duration}', RPE ${d.rpe}${pain}`, {
      label: 'Deshacer',
      run: async () => {
        await db.workoutLogs.delete(id)
        if (session?.id) await db.planSessions.update(session.id, { status: 'planned' })
      },
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={session ? 'Registrar entreno' : 'Entreno extra'}
      left={<Button variant="plain" onClick={onClose}>Cancelar</Button>}
      right={
        <Button variant="plain" disabled={duration <= 0} onClick={save} style={{ fontWeight: 600 }}>
          Guardar
        </Button>
      }
    >
      {confirm ? (
        <div className="stack-lg">
          <div className="t-title3">Antes de seguir</div>
          {confirm.alerts.map((a) => (
            <div key={a.key + a.id} className="banner">
              <span className="t-sub">
                <b>{a.title}.</b> {a.message}
              </span>
            </div>
          ))}
          <Button
            variant="filled block"
            onClick={async () => {
              await acknowledgeAlerts(confirm.alerts)
              onClose()
              toast('Guardado. Ojo con la recuperación.')
            }}
          >
            Lo sé, confirmo el registro
          </Button>
          <Button
            variant="block"
            onClick={async () => {
              await db.workoutLogs.delete(confirm.logId)
              if (session?.id) await db.planSessions.update(session.id, { status: 'planned' })
              onClose()
            }}
          >
            Deshacer el registro
          </Button>
        </div>
      ) : (
      <div className="stack-lg">
        <div className="t-sub muted">
          {session ? `${session.title} · ` : ''}
          {formatDayLong(date)}
        </div>

        {!session && (
          <Field label="Deporte">
            <Chips value={d.sport} onChange={(sport) => set({ sport })} options={SPORTS.map((s) => ({ value: s, label: SPORT_LABEL[s] }))} />
          </Field>
        )}

        {isBrick ? (
          <div className="row">
            <div className="grow">
              <Field label="Bici">
                <NumberInput value={d.bikeMin} onChange={(bikeMin) => set({ bikeMin })} suffix="min" />
              </Field>
            </div>
            <div className="grow">
              <Field label="Carrera">
                <NumberInput value={d.runMin} onChange={(runMin) => set({ runMin })} suffix="min" />
              </Field>
            </div>
          </div>
        ) : (
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <Field label="Duración">
                <NumberInput value={d.durationMin} onChange={(durationMin) => set({ durationMin })} suffix="min" />
              </Field>
            </div>
            {d.sport !== 'strength' && (
              <div className="grow">
                <Field label="Distancia">
                  <NumberInput value={d.distance} onChange={(distance) => set({ distance })} suffix={distUnit} />
                </Field>
              </div>
            )}
          </div>
        )}

        <Field label={`Esfuerzo (RPE): ${d.rpe} · ${RPE_LABEL[d.rpe]}`}>
          <input className="rpe" type="range" min={1} max={10} step={1} value={d.rpe} onChange={(e) => set({ rpe: Number(e.target.value) })} aria-label="RPE" />
        </Field>

        <Field label="FC media (opcional)">
          <NumberInput value={d.avgHr} onChange={(avgHr) => set({ avgHr })} suffix="ppm" step="1" />
        </Field>

        <Field label="Sensaciones">
          <textarea className="input" value={d.feelingText} placeholder="¿Cómo te has sentido?" onChange={(e) => set({ feelingText: e.target.value })} />
        </Field>

        <Field label="Dolor o molestias">
          <Chips value={d.painZone ?? ''} onChange={(z) => set({ painZone: d.painZone === z ? undefined : z, painLevel: d.painZone === z ? undefined : d.painLevel ?? 2 })} options={PAIN_ZONES.map((z) => ({ value: z, label: z }))} />
        </Field>
        {d.painZone && (
          <Field label={`Intensidad del dolor: ${d.painLevel ?? 0}/10`} hint={(d.painLevel ?? 0) >= 4 ? 'Dolor ≥ 4/10: si dura más de 2 días, reduce o sustituye la sesión y consulta a un profesional.' : undefined}>
            <Rating value={d.painLevel} onChange={(painLevel) => set({ painLevel })} min={1} max={10} />
          </Field>
        )}

        <Field label="Clima">
          <Chips value={d.weather ?? ''} onChange={(w) => set({ weather: d.weather === w ? undefined : w })} options={WEATHER.map((w) => ({ value: w, label: w }))} />
        </Field>
      </div>
      )}
    </Sheet>
  )
}

import { addDays, type ISODate } from '../domain/dates'
import { alertId, evaluateAmbition, type Alert, type GuardrailInput } from '../domain/guardrails/ambition'
import { db, getSetting, setSetting, type Profile } from './db'
import { targetsFor } from './nutrition'

/** Reúne los datos de las últimas 3 semanas para el freno de ambición. */
export async function guardrailInput(profile: Profile, today: ISODate): Promise<GuardrailInput> {
  const from = addDays(today, -21)
  const [logs, weights, checkins, meals] = await Promise.all([
    db.workoutLogs.where('date').between(from, today, true, true).toArray(),
    db.bodyLogs.where('date').between(from, today, true, true).toArray(),
    db.checkins.where('date').between(from, today, true, true).toArray(),
    db.mealLogs.where('date').between(addDays(today, -3), today, true, true).toArray(),
  ])

  // Solo días con al menos 3 comidas distintas apuntadas: si no, el déficit sería falso
  const nutrition = []
  for (let k = 1; k <= 3; k++) {
    const d = addDays(today, -k)
    const day = meals.filter((m) => m.date === d)
    if (new Set(day.map((m) => m.mealType)).size < 3) continue
    const t = await targetsFor(profile, d)
    nutrition.push({ date: d, intakeKcal: day.reduce((a, m) => a + m.kcal, 0), tdee: t.tdee, bmr: t.bmr })
  }

  return {
    today,
    workouts: logs.map((l) => ({ date: l.date, durationMin: l.durationMin, rpe: l.rpe, isExtra: l.isExtra })),
    weights: weights.map((w) => ({ date: w.date, kg: w.weightKg })),
    pains: [
      ...checkins.filter((c) => c.painZone && c.painLevel).map((c) => ({ date: c.date, zone: c.painZone!, level: c.painLevel! })),
      ...logs.filter((l) => l.painZone && l.painLevel).map((l) => ({ date: l.date, zone: l.painZone!, level: l.painLevel! })),
    ],
    nutrition,
  }
}

export async function currentAlerts(profile: Profile, today: ISODate): Promise<Alert[]> {
  return evaluateAmbition(await guardrailInput(profile, today))
}

// ---------- confirmaciones ----------

const ACK_KEY = 'ackAlerts'

export async function acknowledgedAlerts(): Promise<string[]> {
  return getSetting<string[]>(ACK_KEY, [])
}

/** Confirmación explícita del usuario ("lo sé, sigo"): esa ocurrencia deja de mostrarse. */
export async function acknowledgeAlerts(alerts: Alert[]) {
  const acks = new Set(await acknowledgedAlerts())
  alerts.forEach((a) => acks.add(alertId(a)))
  await setSetting(ACK_KEY, [...acks].slice(-200))
}

export async function pendingAlerts(profile: Profile, today: ISODate): Promise<Alert[]> {
  const [alerts, acks] = await Promise.all([currentAlerts(profile, today), acknowledgedAlerts()])
  return alerts.filter((a) => !acks.includes(alertId(a)))
}

/** Alertas que aparecen por un registro nuevo (las de antes ya se conocían). */
export function newAlerts(before: Alert[], after: Alert[]): Alert[] {
  const known = new Set(before.map(alertId))
  return after.filter((a) => !known.has(alertId(a)))
}

// ---------- señal de alarma: aviso fijo ----------

export interface AlarmState {
  active: boolean
  since: string
  symptoms: string[]
  text: string
}

const ALARM_KEY = 'alarm'

export async function getAlarm(): Promise<AlarmState | null> {
  const a = await getSetting<AlarmState | null>(ALARM_KEY, null)
  return a?.active ? a : null
}

export async function raiseAlarm(symptoms: string[], text: string) {
  const prev = await getAlarm()
  await setSetting(ALARM_KEY, {
    active: true,
    since: prev?.since ?? new Date().toISOString(),
    symptoms: [...new Set([...(prev?.symptoms ?? []), ...symptoms])],
    text,
  } satisfies AlarmState)
}

export async function clearAlarm() {
  await setSetting(ALARM_KEY, null)
}

import { addDays, ageOn, weekNumberFor, weekStart, type ISODate } from '../domain/dates'
import { phaseForWeek } from '../domain/plan/generator'
import {
  ADJUSTMENT_LIMITS,
  computeTargets,
  movingAverage,
  weeklyAdjustment,
  type TrainingBlock,
  type Targets,
} from '../domain/nutrition/targets'
import { db, getSetting, setSetting, type Profile } from './db'
import { planStartFor } from './plan'

export interface AdjustmentState {
  kcal: number
  week: number
  reason: string
}

const ADJ_KEY = 'kcalAdjustment'

export async function getAdjustment(): Promise<AdjustmentState> {
  return getSetting<AdjustmentState>(ADJ_KEY, { kcal: 0, week: 0, reason: '' })
}

/** Peso actual: media de los últimos 7 días con dato, o el peso inicial. */
export async function currentWeight(profile: Profile, date: ISODate): Promise<number> {
  const logs = await db.bodyLogs.where('date').between(addDays(date, -30), date, true, true).toArray()
  if (!logs.length) return profile.startWeightKg
  const ma = movingAverage(logs.map((l) => ({ date: l.date, kg: l.weightKg })))
  return Math.round(ma[ma.length - 1].kg * 10) / 10
}

/** Entreno del día: lo registrado si existe; si no, lo planificado pendiente. */
export async function trainingFor(date: ISODate): Promise<TrainingBlock[]> {
  const [logs, planned] = await Promise.all([db.workoutLogs.where('date').equals(date).toArray(), db.planSessions.where('date').equals(date).toArray()])
  const blocks: TrainingBlock[] = logs.map((l) => ({
    sport: l.sport,
    durationMin: l.durationMin,
    structure: l.segments ? { kind: 'segments', segments: l.segments } : undefined,
  }))
  for (const s of planned) {
    if (s.status !== 'planned' || s.optional) continue
    blocks.push({ sport: s.sport, durationMin: s.durationMin, structure: s.structure })
  }
  return blocks
}

export async function targetsFor(profile: Profile, date: ISODate): Promise<Targets> {
  const planStart = planStartFor(profile)
  const week = weekNumberFor(planStart, date) ?? 1
  const [weightKg, training, adj] = await Promise.all([currentWeight(profile, date), trainingFor(date), getAdjustment()])
  return computeTargets({
    sex: profile.sex,
    age: ageOn(profile.birthDate, date),
    heightCm: profile.heightCm,
    weightKg,
    goalWeightKg: profile.goalWeightKg,
    phase: phaseForWeek(week),
    training,
    adjustmentKcal: adj.kcal,
  })
}

/**
 * Una vez por semana (al abrir la app a partir del lunes) recalcula el ajuste
 * adaptativo de calorías con la tendencia de peso, la adherencia y la fatiga.
 */
export async function runWeeklyAdjustment(profile: Profile, today: ISODate): Promise<AdjustmentState | null> {
  const planStart = planStartFor(profile)
  const week = weekNumberFor(planStart, today)
  if (!week || week < 3) return null
  const state = await getAdjustment()
  if (state.week >= week) return null

  const from = weekStart(planStart, week - 2)
  const to = addDays(weekStart(planStart, week), -1)
  const [weights, sessions, checkins, logs] = await Promise.all([
    db.bodyLogs.where('date').between(addDays(from, -7), to, true, true).toArray(),
    db.planSessions.where('date').between(from, to, true, true).toArray(),
    db.checkins.where('date').between(from, to, true, true).toArray(),
    db.workoutLogs.where('date').between(from, to, true, true).toArray(),
  ])
  const required = sessions.filter((s) => !s.optional && s.sport !== 'race')
  const adherence = required.length ? required.filter((s) => s.status === 'done').length / required.length : 0

  const mid = addDays(from, 7)
  const avg = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const e1 = avg(checkins.filter((c) => c.date < mid).map((c) => c.energy))
  const e2 = avg(checkins.filter((c) => c.date >= mid).map((c) => c.energy))
  const s1 = avg(checkins.filter((c) => c.date < mid).map((c) => c.sleepQuality))
  const s2 = avg(checkins.filter((c) => c.date >= mid).map((c) => c.sleepQuality))
  const r1 = avg(logs.filter((l) => l.date < mid).map((l) => l.rpe))
  const r2 = avg(logs.filter((l) => l.date >= mid).map((l) => l.rpe))
  const fatigueRising = e1 != null && e2 != null && r1 != null && r2 != null && e2 < e1 && r2 > r1 && (s1 == null || s2 == null || s2 <= s1)

  const adj = weeklyAdjustment({ weights: weights.map((w) => ({ date: w.date, kg: w.weightKg })), adherence, fatigueRising })
  const next: AdjustmentState = {
    kcal: Math.min(ADJUSTMENT_LIMITS.max, Math.max(ADJUSTMENT_LIMITS.min, state.kcal + adj.deltaKcal)),
    week,
    reason: adj.reason,
  }
  await setSetting(ADJ_KEY, next)
  return next
}

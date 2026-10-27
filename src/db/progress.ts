import { addDays, weekStart, type ISODate } from '../domain/dates'
import { movingAverage, weeklySlope } from '../domain/nutrition/targets'
import { EMPTY_MARKS, evaluateMilestones, projectWeight, trafficLight, type Marks, type MilestoneEvaluation, type Projection, type TrafficLight } from '../domain/progress/rules'
import type { Phase } from '../domain/types'
import { db, type Profile } from './db'
import { getAlarm, guardrailInput } from './guardrails'
import { evaluateAmbition } from '../domain/guardrails/ambition'
import { phaseOf, planStartFor, planWeeksFor, weekOf } from './plan'
import { goalOf } from '../domain/goals'

export type SportGroup = 'swim' | 'bike' | 'strength' | 'run' | 'other'
/** Orden de apilado validado para daltonismo: azul, naranja, morado, rosa (+ gris). */
export const SPORT_GROUPS: SportGroup[] = ['swim', 'bike', 'strength', 'run', 'other']

export interface WeekStats {
  week: number
  start: ISODate
  phase: Phase
  isRecovery: boolean
  minutes: Record<SportGroup, number>
  km: Record<SportGroup, number>
  plannedMin: number
  load: number
  avgRpe: number | null
  required: number
  done: number
  avgKcal: number | null
  avgProtein: number | null
  avgSleep: number | null
  avgEnergy: number | null
  light: TrafficLight
}

const zero = (): Record<SportGroup, number> => ({ swim: 0, bike: 0, strength: 0, run: 0, other: 0 })
const avg = (xs: (number | undefined | null)[]) => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Estadísticas por semana del plan, de la 1 a la actual. */
export async function weeklyStats(profile: Profile, today: ISODate): Promise<WeekStats[]> {
  const planStart = planStartFor(profile)
  const current = weekOf(profile, today) ?? (today > planStart ? planWeeksFor(profile) : 0)
  if (current < 1) return []
  const end = addDays(weekStart(planStart, current), 6)
  const [sessions, weeks, logs, meals, checkins, alarm] = await Promise.all([
    db.planSessions.where('weekNumber').belowOrEqual(current).toArray(),
    db.planWeeks.where('weekNumber').belowOrEqual(current).toArray(),
    db.workoutLogs.where('date').between(planStart, end, true, true).toArray(),
    db.mealLogs.where('date').between(planStart, end, true, true).toArray(),
    db.checkins.where('date').between(planStart, end, true, true).toArray(),
    getAlarm(),
  ])
  const painAlerts = evaluateAmbition(await guardrailInput(profile, today)).filter((a) => a.key === 'pain_streak')

  const out: WeekStats[] = []
  for (let w = 1; w <= current; w++) {
    const start = weekStart(planStart, w)
    const stop = addDays(start, 6)
    const inWeek = (d: ISODate) => d >= start && d <= stop
    const wl = logs.filter((l) => inWeek(l.date))
    const minutes = zero()
    const km = zero()
    for (const l of wl) {
      if (l.sport === 'brick' && l.segments) {
        for (const s of l.segments) minutes[s.sport === 'bike' ? 'bike' : 'run'] += s.durationMin
        km.bike += (l.distanceM ?? 0) / 1000
        continue
      }
      const g: SportGroup = l.sport === 'swim' || l.sport === 'bike' || l.sport === 'strength' || l.sport === 'run' ? l.sport : 'other'
      minutes[g] += l.durationMin
      km[g] += (l.distanceM ?? 0) / 1000
    }
    const ws = sessions.filter((s) => s.weekNumber === w)
    const req = ws.filter((s) => !s.optional && s.sport !== 'race' && s.date <= today)
    const totalMin = wl.reduce((a, l) => a + l.durationMin, 0)
    const avgRpe = totalMin ? wl.reduce((a, l) => a + l.rpe * l.durationMin, 0) / totalMin : null
    const plannedRpe = avg(req.map((s) => s.intensityRpe))
    const days = [...new Set(meals.filter((m) => inWeek(m.date)).map((m) => m.date))]
    const wm = meals.filter((m) => inWeek(m.date))
    const wc = checkins.filter((c) => inWeek(c.date))
    const avgEnergy = avg(wc.map((c) => c.energy))
    out.push({
      week: w,
      start,
      phase: phaseOf(profile, w),
      isRecovery: weeks.find((x) => x.weekNumber === w)?.isRecovery ?? false,
      minutes,
      km,
      plannedMin: ws.filter((s) => !s.optional && s.sport !== 'race').reduce((a, s) => a + s.durationMin, 0),
      load: Math.round((totalMin / 60) * (avgRpe ?? 0) * 10) / 10,
      avgRpe: avgRpe != null ? Math.round(avgRpe * 10) / 10 : null,
      required: req.length,
      done: req.filter((s) => s.status === 'done').length,
      avgKcal: days.length ? Math.round(wm.reduce((a, m) => a + m.kcal, 0) / days.length) : null,
      avgProtein: days.length ? Math.round(wm.reduce((a, m) => a + m.protein, 0) / days.length) : null,
      avgSleep: avg(wc.map((c) => c.sleepHours)),
      avgEnergy,
      light: trafficLight({
        required: req.length,
        done: req.filter((s) => s.status === 'done').length,
        avgRpe,
        plannedRpe,
        avgEnergy,
        persistentPain: w === current && painAlerts.length > 0,
        alarm: w === current && !!alarm,
      }),
    })
  }
  return out
}

/** Mejores marcas a partir de los registros y de las marcas apuntadas a mano. */
export async function computeMarks(profile: Profile): Promise<Marks> {
  const [logs, tests, sessions] = await Promise.all([db.workoutLogs.toArray(), db.testResults.toArray(), db.planSessions.where('status').equals('done').toArray()])
  const sessionById = new Map(sessions.map((s) => [s.id!, s]))
  const best = (type: string) => Math.max(0, ...tests.filter((t) => t.type === type).map((t) => t.value))
  const m: Marks = { ...EMPTY_MARKS }

  for (const l of logs) {
    const km = (l.distanceM ?? 0) / 1000
    if (l.sport === 'bike') {
      m.bikeLongMin = Math.max(m.bikeLongMin, l.durationMin)
      m.bikeLongKm = Math.max(m.bikeLongKm, km)
    } else if (l.sport === 'brick') {
      const bike = l.segments?.find((s) => s.sport === 'bike')?.durationMin ?? 0
      m.bikeLongMin = Math.max(m.bikeLongMin, bike)
      m.bikeLongKm = Math.max(m.bikeLongKm, km)
    } else if (l.sport === 'run') {
      m.runLongKm = Math.max(m.runLongKm, km)
      const s = l.planSessionId ? sessionById.get(l.planSessionId) : undefined
      // Las sesiones de trote/caminata por intervalos no cuentan como carrera continua
      if (s?.structure?.kind !== 'intervals') m.runContinuousMin = Math.max(m.runContinuousMin, s?.test === 'run20' ? 20 : l.durationMin)
    } else if (l.sport === 'swim') {
      m.swimSessionM = Math.max(m.swimSessionM, l.distanceM ?? 0)
    }
  }
  m.runContinuousMin = Math.max(m.runContinuousMin, best('run_continuous_min'), best('run20') > 0 ? 20 : 0)
  m.swimContinuousM = Math.max(profile.swimContinuousM, best('swim_continuous_m'), best('swim400') > 0 ? 400 : 0)
  m.swimSessionM = Math.max(m.swimSessionM, m.swimContinuousM)
  m.openWaterM = best('open_water_m')
  m.runLongKm = Math.round(m.runLongKm * 10) / 10
  m.bikeLongKm = Math.round(m.bikeLongKm * 10) / 10
  return m
}

export async function milestoneStatus(profile: Profile, today: ISODate): Promise<MilestoneEvaluation[]> {
  const planStart = planStartFor(profile)
  if (goalOf(profile).type !== 'triathlon') return []
  const currentWeek = weekOf(profile, today) ?? (today < planStart ? 0 : 51)
  const marks = await computeMarks(profile)
  let adherenceFirst4: number | null = null
  if (currentWeek >= 1) {
    const req = (await db.planSessions.where('weekNumber').belowOrEqual(4).toArray()).filter((s) => !s.optional && s.date <= today)
    adherenceFirst4 = req.length ? Math.round((req.filter((s) => s.status === 'done').length / req.length) * 100) : null
  }
  return evaluateMilestones({ currentWeek, marks, adherenceFirst4, medicalCheckDone: profile.medicalCheckDone })
}

export interface WeightSeries {
  points: { date: ISODate; kg: number }[]
  average: { date: ISODate; kg: number }[]
  projection: Projection | null
  currentKg: number
}

export async function weightSeries(profile: Profile, today: ISODate): Promise<WeightSeries> {
  const logs = await db.bodyLogs.orderBy('date').toArray()
  const points = logs.map((l) => ({ date: l.date, kg: l.weightKg }))
  const average = movingAverage(points).map((p) => ({ date: p.date, kg: Math.round(p.kg * 10) / 10 }))
  const currentKg = average.at(-1)?.kg ?? profile.startWeightKg
  const slope = weeklySlope(points.filter((p) => p.date >= addDays(today, -28)), 28)
  const week = weekOf(profile, today) ?? 1
  return { points, average, currentKg, projection: slope != null ? projectWeight(currentKg, week, slope, profile.goalWeightKg) : null }
}

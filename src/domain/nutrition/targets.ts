import type { GoalType } from '../goals'
import type { Phase, SessionStructure, Sport } from '../types'

// Objetivos de calorías y macros (spec §10). Todo puro y testeado.

export type Sex = 'male' | 'female'
export type DayType = 'rest' | 'short' | 'long' | 'race'

/** Mifflin-St Jeor */
export function bmr(sex: Sex, kg: number, cm: number, age: number): number {
  return Math.round(10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161))
}

export interface TrainingBlock {
  sport: Sport
  durationMin: number
  structure?: SessionStructure
  /** Calorías reales (reloj/HealthKit) si existen: se prefieren. */
  kcal?: number
}

/** MET orientativos de la spec: caminar 4, trote 8-9, bici suave 6-7, natación 6, fuerza 4-5. */
const MET: Record<Sport, number> = {
  swim: 6,
  bike: 6.5,
  run: 8.5,
  walk: 4,
  strength: 4.5,
  brick: 7,
  hyrox: 8,
  cardio: 5,
  race: 8,
  other: 4,
}

export function sessionKcal(b: TrainingBlock, kg: number): number {
  if (b.kcal) return b.kcal
  let met = MET[b.sport]
  if (b.structure?.kind === 'intervals' && b.sport === 'run') {
    const { reps, onMin, offMin, warmupMin, cooldownMin } = b.structure
    const total = reps * (onMin + offMin) + warmupMin + cooldownMin
    met = (reps * onMin * MET.run + (reps * offMin + warmupMin + cooldownMin) * MET.walk) / total
  } else if (b.structure?.kind === 'segments') {
    return Math.round(b.structure.segments.reduce((a, s) => a + MET[s.sport] * kg * (s.durationMin / 60), 0))
  }
  return Math.round(met * kg * (b.durationMin / 60))
}

export function dayTypeFor(blocks: TrainingBlock[]): DayType {
  if (blocks.some((b) => b.sport === 'race')) return 'race'
  const total = blocks.reduce((a, b) => a + b.durationMin, 0)
  if (total === 0) return 'rest'
  return total >= 120 ? 'long' : 'short'
}

/** Déficit diario por fase (spec §10). */
export function phaseDeficit(phase: Phase, kg: number, goalKg: number): number {
  switch (phase) {
    case 'base':
    case 'build1':
      return 450
    case 'build2':
      return kg > goalKg ? 250 : 0
    case 'specific':
    case 'taper':
      return kg > goalKg ? 100 : 0
    case 'race':
      return 0
  }
}

/**
 * Déficit (positivo) o superávit (negativo) según el objetivo:
 * - Perder peso: déficit moderado hasta el peso objetivo.
 * - Fuerza y tono: recomposición; déficit pequeño si sobra peso, superávit ligero si se busca ganar.
 * - Carrera y Hyrox: déficit en la primera parte, casi nada al acercarse la prueba.
 * - Triatlón: según la fase (spec §10).
 */
export function goalDeficit(goalType: GoalType | undefined, phase: Phase, kg: number, goalKg: number, progress = 0): number {
  switch (goalType) {
    case 'weight_loss':
      return kg > goalKg ? 450 : 0
    case 'strength':
      if (kg > goalKg + 1) return 300
      if (kg < goalKg - 1) return -200
      return 0
    case 'running':
    case 'hyrox':
      if (phase === 'taper' || phase === 'race' || kg <= goalKg) return 0
      return progress > 0.75 ? 150 : 400
    default:
      return phaseDeficit(phase, kg, goalKg)
  }
}

export interface TargetInput {
  sex: Sex
  age: number
  heightCm: number
  /** Peso actual (media de 7 días si hay datos) */
  weightKg: number
  goalWeightKg: number
  phase: Phase
  training: TrainingBlock[]
  /** Ajuste adaptativo acumulado (kcal) */
  adjustmentKcal?: number
  goalType?: GoalType
  /** Avance del plan (0-1), para afinar el déficit al acercarse una prueba */
  planProgress?: number
}

export interface Targets {
  dayType: DayType
  bmr: number
  tdee: number
  trainingKcal: number
  deficit: number
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
  waterMl: number
  notes: string[]
}

export function computeTargets(i: TargetInput): Targets {
  const base = bmr(i.sex, i.weightKg, i.heightCm, i.age)
  const trainingKcal = i.training.reduce((a, b) => a + sessionKcal(b, i.weightKg), 0)
  const tdee = Math.round(base * 1.3 + trainingKcal)
  const dayType = dayTypeFor(i.training)
  const notes: string[] = []

  let deficit = goalDeficit(i.goalType, i.phase, i.weightKg, i.goalWeightKg, i.planProgress)
  if (dayType === 'long' || dayType === 'race') {
    if (deficit > 0) notes.push('Día de sesión larga: sin déficit.')
    deficit = Math.min(0, deficit)
  }

  let kcal = tdee - deficit + (i.adjustmentKcal ?? 0)
  // Nunca por encima del gasto si hay déficit pautado, nunca por debajo del basal
  if (deficit > 0) kcal = Math.min(kcal, tdee)
  if (deficit < 0) notes.push(`Ligero superávit (+${-deficit} kcal) para ganar músculo.`)
  if (kcal < base) {
    kcal = base
    notes.push('Ajustado al metabolismo basal: nunca comas por debajo.')
  }

  const proteinG = Math.round(1.8 * i.weightKg)
  let fatG = Math.round(Math.max(0.9 * i.weightKg, (0.25 * kcal) / 9))
  let carbsG = Math.round((kcal - proteinG * 4 - fatG * 9) / 4)

  // Días largos en fase Específica: al menos 5 g/kg de hidratos
  if (dayType === 'long' && (i.phase === 'specific' || i.phase === 'taper')) {
    const minCarbs = Math.round(5 * i.weightKg)
    if (carbsG < minCarbs) {
      kcal += (minCarbs - carbsG) * 4
      carbsG = minCarbs
      notes.push('Hidratos ≥ 5 g/kg para el día largo.')
    }
  }
  if (dayType === 'race') {
    const raceCarbs = Math.round(7 * i.weightKg)
    if (carbsG < raceCarbs) {
      kcal += (raceCarbs - carbsG) * 4
      carbsG = raceCarbs
    }
  }
  if (carbsG < 0) {
    fatG = Math.round(Math.max(0, (kcal - proteinG * 4) / 9))
    carbsG = 0
  }

  const trainingMin = i.training.reduce((a, b) => a + b.durationMin, 0)
  return {
    dayType,
    bmr: base,
    tdee,
    trainingKcal,
    deficit,
    kcal: Math.round(kcal),
    proteinG,
    carbsG,
    fatG,
    fiberG: 30,
    waterMl: Math.round((35 * i.weightKg + (trainingMin / 60) * 500) / 50) * 50,
    notes,
  }
}

/** Qué tomar durante el entreno (spec §10). */
export function fuelingAdvice(durationMin: number, phase: Phase): string | null {
  if (durationMin < 75) return null
  if (durationMin <= 120) return '30-60 g de hidratos por hora (bebida isotónica, gel o plátano) y agua a sorbos.'
  if (phase === 'specific' || phase === 'taper' || phase === 'race')
    return '60-90 g de hidratos por hora, 500-750 ml de líquido por hora y sodio según el calor. Practica lo mismo que usarás en carrera.'
  return '45-60 g de hidratos por hora, 500-750 ml de líquido por hora y algo de sodio si hace calor.'
}

// ---------- ajuste adaptativo semanal ----------

export interface WeightPoint {
  date: string
  kg: number
}

/** Media móvil de 7 días por fecha (solo días con dato). */
export function movingAverage(points: WeightPoint[], window = 7): WeightPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((p) => {
    const t = Date.parse(p.date)
    const inWindow = sorted.filter((q) => {
      const d = (t - Date.parse(q.date)) / 86_400_000
      return d >= 0 && d < window
    })
    return { date: p.date, kg: inWindow.reduce((a, q) => a + q.kg, 0) / inWindow.length }
  })
}

/** Pendiente (kg/semana) de la media móvil en los últimos `days` días, por mínimos cuadrados. */
export function weeklySlope(points: WeightPoint[], days = 14): number | null {
  const ma = movingAverage(points)
  if (ma.length < 3) return null
  const last = Date.parse(ma[ma.length - 1].date)
  const recent = ma.filter((p) => (last - Date.parse(p.date)) / 86_400_000 <= days)
  if (recent.length < 3) return null
  const xs = recent.map((p) => (Date.parse(p.date) - last) / 86_400_000)
  const ys = recent.map((p) => p.kg)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  if (den === 0) return null
  const slopePerDay = xs.reduce((a, x, k) => a + (x - mx) * (ys[k] - my), 0) / den
  return slopePerDay * 7
}

export interface AdjustmentInput {
  weights: WeightPoint[]
  /** Adherencia al plan en las últimas 2 semanas (0-1) */
  adherence: number
  /** Energía y sueño bajando a la vez que sube el RPE */
  fatigueRising: boolean
}

export interface Adjustment {
  deltaKcal: number
  reason: string
}

export function weeklyAdjustment({ weights, adherence, fatigueRising }: AdjustmentInput): Adjustment {
  const slope = weeklySlope(weights, 14)
  if (slope == null) return { deltaKcal: 0, reason: 'Faltan datos de peso para ajustar (pésate 3-4 veces por semana).' }
  const current = movingAverage(weights).at(-1)!.kg
  const pct = slope / current

  if (fatigueRising) {
    return pct < -0.0025
      ? { deltaKcal: 150, reason: 'Cansancio en aumento mientras bajas de peso: subimos 150 kcal en vez de recortar.' }
      : { deltaKcal: 0, reason: 'Cansancio en aumento: no se recorta. Valora descargar.' }
  }
  if (pct < -0.01) return { deltaKcal: 150, reason: 'Bajas más de un 1 % por semana: +150 kcal para proteger el rendimiento.' }
  const span = (Date.parse(weights.at(-1)!.date) - Date.parse(weights[0].date)) / 86_400_000
  if (pct > -0.0025 && span >= 14 && adherence > 0.8)
    return { deltaKcal: -125, reason: 'Peso estancado 2 semanas con buena adherencia: −125 kcal (revisa también el registro).' }
  return { deltaKcal: 0, reason: 'Ritmo de pérdida correcto: sin cambios.' }
}

export const ADJUSTMENT_LIMITS = { min: -300, max: 450 }

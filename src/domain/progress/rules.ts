// Reglas de progreso (spec §6 y §8.5): hitos, semáforo y proyección.
// Todo en código, sin IA, para que las valoraciones sean reproducibles.

export interface Marks {
  /** Minutos de carrera continua (mejor marca) */
  runContinuousMin: number
  /** Km de la carrera más larga */
  runLongKm: number
  /** Minutos de la bici más larga */
  bikeLongMin: number
  /** Km de la bici más larga */
  bikeLongKm: number
  /** Metros de natación seguidos (mejor marca) */
  swimContinuousM: number
  /** Metros de la sesión de natación más larga (acumulando con pausas) */
  swimSessionM: number
  /** Metros en aguas abiertas */
  openWaterM: number
}

export const EMPTY_MARKS: Marks = { runContinuousMin: 0, runLongKm: 0, bikeLongMin: 0, bikeLongKm: 0, swimContinuousM: 0, swimSessionM: 0, openWaterM: 0 }

interface Criterion {
  label: string
  mark?: keyof Marks
  target: number
  unit: string
  special?: 'adherence4w' | 'medical'
}

export interface MilestoneRule {
  key: string
  week: number
  criteria: Criterion[]
}

export const MILESTONE_RULES: MilestoneRule[] = [
  { key: 'H0', week: 0, criteria: [{ label: 'Chequeo médico con prueba de esfuerzo', target: 1, unit: '', special: 'medical' }] },
  {
    key: 'H1',
    week: 4,
    criteria: [
      { label: '≥ 85 % de sesiones en S1-S4', target: 85, unit: '%', special: 'adherence4w' },
      { label: '400 m de natación acumulando', mark: 'swimSessionM', target: 400, unit: 'm' },
    ],
  },
  {
    key: 'H2',
    week: 8,
    criteria: [
      { label: "10' de trote continuo", mark: 'runContinuousMin', target: 10, unit: 'min' },
      { label: "Bici 60' en zona 2", mark: 'bikeLongMin', target: 60, unit: 'min' },
      { label: '400 m de natación seguidos', mark: 'swimContinuousM', target: 400, unit: 'm' },
    ],
  },
  {
    key: 'H3',
    week: 12,
    criteria: [
      { label: "20' de carrera continua", mark: 'runContinuousMin', target: 20, unit: 'min' },
      { label: "Bici 100'", mark: 'bikeLongMin', target: 100, unit: 'min' },
      { label: '800 m de natación seguidos', mark: 'swimContinuousM', target: 800, unit: 'm' },
    ],
  },
  {
    key: 'H4',
    week: 24,
    criteria: [
      { label: '6 km de carrera continua', mark: 'runLongKm', target: 6, unit: 'km' },
      { label: 'Bici 2 h 30', mark: 'bikeLongMin', target: 150, unit: 'min' },
      { label: '1.500 m de natación seguidos', mark: 'swimContinuousM', target: 1500, unit: 'm' },
    ],
  },
  {
    key: 'H5',
    week: 36,
    criteria: [
      { label: '12 km de carrera', mark: 'runLongKm', target: 12, unit: 'km' },
      { label: 'Bici 3 h 15', mark: 'bikeLongMin', target: 195, unit: 'min' },
      { label: '1.900 m de natación seguidos', mark: 'swimContinuousM', target: 1900, unit: 'm' },
      { label: '1 km en aguas abiertas', mark: 'openWaterM', target: 1000, unit: 'm' },
    ],
  },
  {
    key: 'H6',
    week: 46,
    criteria: [
      { label: 'Bici de 85 km', mark: 'bikeLongKm', target: 85, unit: 'km' },
      { label: 'Carrera larga de 16 km', mark: 'runLongKm', target: 16, unit: 'km' },
      { label: 'Natación de 2.000 m', mark: 'swimSessionM', target: 2000, unit: 'm' },
    ],
  },
]

export type MilestoneStatus = 'done' | 'ahead' | 'on_track' | 'in_progress' | 'behind' | 'future'

export interface CriterionResult {
  label: string
  met: boolean
  value: number
  target: number
  unit: string
}

export interface MilestoneEvaluation {
  key: string
  week: number
  status: MilestoneStatus
  ratio: number
  criteria: CriterionResult[]
  reason: string
}

export interface MilestoneInput {
  currentWeek: number
  marks: Marks
  /** Adherencia (0-100) de las semanas 1-4, o null si aún no se ha llegado */
  adherenceFirst4: number | null
  medicalCheckDone: boolean
}

const fmt = (n: number, unit: string) => `${Math.round(n * 10) / 10 === Math.round(n) ? Math.round(n) : (Math.round(n * 10) / 10).toString().replace('.', ',')}${unit ? ` ${unit}` : ''}`

/**
 * Reglas de la spec §6:
 * - Adelantado: cumple todo al menos 1 semana antes.
 * - En camino: cumple ≥ 80 % de los criterios.
 * - Retrasado: < 80 % a falta de 2 semanas (o ya pasada).
 */
export function evaluateMilestone(rule: MilestoneRule, i: MilestoneInput): MilestoneEvaluation {
  const criteria: CriterionResult[] = rule.criteria.map((c) => {
    const value = c.special === 'medical' ? (i.medicalCheckDone ? 1 : 0) : c.special === 'adherence4w' ? (i.adherenceFirst4 ?? 0) : i.marks[c.mark!]
    return { label: c.label, met: value >= c.target, value, target: c.target, unit: c.unit }
  })
  const ratio = criteria.filter((c) => c.met).length / criteria.length
  const weeksLeft = rule.week - i.currentWeek
  const missing = criteria.filter((c) => !c.met)
  const missingText = missing
    .map((c) => (c.unit && c.unit !== '%' ? `${c.label} (llevas ${fmt(c.value, c.unit)})` : c.label))
    .join('; ')

  let status: MilestoneStatus
  let reason: string
  if (ratio === 1 && weeksLeft >= 1) {
    status = 'ahead'
    reason = `Cumplido ${weeksLeft === 1 ? '1 semana' : `${weeksLeft} semanas`} antes de tiempo.`
  } else if (ratio === 1) {
    status = 'done'
    reason = 'Cumplido.'
  } else if (ratio >= 0.8) {
    status = 'on_track'
    reason = `Casi: falta ${missingText}.`
  } else if (weeksLeft <= 2) {
    status = 'behind'
    reason =
      rule.week === 0
        ? `Pendiente antes de cargar el entrenamiento: ${missingText}.`
        : weeksLeft < 0
          ? `La semana objetivo ya pasó. Falta: ${missingText}.`
          : `Quedan ${weeksLeft} semanas y falta: ${missingText}.`
  } else if (i.currentWeek >= rule.week - 8 || rule.week === 0) {
    status = 'in_progress'
    reason = `Falta: ${missingText}.`
  } else {
    status = 'future'
    reason = `Semana ${rule.week}.`
  }
  return { key: rule.key, week: rule.week, status, ratio, criteria, reason }
}

export function evaluateMilestones(i: MilestoneInput): MilestoneEvaluation[] {
  return MILESTONE_RULES.map((r) => evaluateMilestone(r, i))
}

// ---------- semáforo semanal (spec §8.5) ----------

export type Light = 'green' | 'yellow' | 'red' | 'none'

export interface WeekSignals {
  required: number
  done: number
  /** RPE medio realizado y el previsto por el plan */
  avgRpe: number | null
  plannedRpe: number | null
  /** Media de energía de los check-ins (1-5) */
  avgEnergy: number | null
  persistentPain: boolean
  alarm: boolean
}

export interface TrafficLight {
  light: Light
  adherence: number | null
  reasons: string[]
  advice: string
}

export function trafficLight(s: WeekSignals): TrafficLight {
  if (s.alarm) return { light: 'red', adherence: s.required ? s.done / s.required : null, reasons: ['Señal de alarma activa'], advice: 'Para y consulta con un médico antes de seguir.' }
  if (!s.required) return { light: 'none', adherence: null, reasons: [], advice: 'Sin sesiones todavía.' }
  const adherence = s.done / s.required
  const reasons: string[] = []
  const highFatigue = (s.avgEnergy != null && s.avgEnergy <= 2.5) || (s.avgRpe != null && s.plannedRpe != null && s.avgRpe > s.plannedRpe + 1.5)
  if (s.persistentPain) reasons.push('Dolor persistente')
  if (adherence < 0.6) reasons.push(`Adherencia ${Math.round(adherence * 100)} %`)
  if (s.persistentPain || adherence < 0.6) return { light: 'red', adherence, reasons, advice: 'Semana de descarga y valoración. Mejor parar un poco que lesionarse.' }
  if (adherence < 0.8) reasons.push(`Adherencia ${Math.round(adherence * 100)} %`)
  if (highFatigue) reasons.push('Fatiga alta')
  if (adherence < 0.8 || highFatigue) return { light: 'yellow', adherence, reasons, advice: 'Repite la semana o baja un 15 % la siguiente.' }
  return { light: 'green', adherence, reasons: [`Adherencia ${Math.round(adherence * 100)} %`], advice: 'Sigue el plan.' }
}

// ---------- proyección ----------

export interface Projection {
  /** kg previstos en la semana indicada */
  weightAt: (week: number) => number
  /** Semana en la que se alcanzaría el peso objetivo, o null si no se alcanza antes de la carrera */
  goalWeek: number | null
  slopePerWeek: number
}

export function projectWeight(currentKg: number, currentWeek: number, slopePerWeek: number, goalKg: number, lastWeek = 51): Projection {
  const weightAt = (w: number) => Math.round((currentKg + slopePerWeek * (w - currentWeek)) * 10) / 10
  let goalWeek: number | null = null
  if (currentKg <= goalKg) goalWeek = currentWeek
  else if (slopePerWeek < 0) {
    const w = currentWeek + Math.ceil((goalKg - currentKg) / slopePerWeek)
    goalWeek = w <= lastWeek ? w : null
  }
  return { weightAt, goalWeek, slopePerWeek }
}

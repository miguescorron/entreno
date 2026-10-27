import { addDays, diffDays, mondayOf, PLAN_WEEKS, planStartFromRace, type ISODate } from './dates'
import type { Equipment } from './exercises'
import type { Phase } from './types'

// Objetivo del usuario y forma del plan que se deriva de él: cuándo empieza,
// cuántas semanas dura y en qué fase cae cada semana.

export type GoalType = 'triathlon' | 'running' | 'hyrox' | 'strength' | 'weight_loss'
export type RunDistance = '5k' | '10k' | 'half' | 'marathon'
export type HyroxDivision = 'open' | 'pro' | 'doubles'
export type StrengthFocus = 'tone' | 'strength' | 'muscle'
export type Level = 'beginner' | 'intermediate' | 'advanced'
export type HomeEquipment = Extract<Equipment, 'gym' | 'dumbbells' | 'none'>

export interface Goal {
  type: GoalType
  /** Carrera: distancia. Triatlón: de momento solo 70.3. */
  distance?: RunDistance | '70.3'
  division?: HyroxDivision
  focus?: StrengthFocus
  eventName?: string
  eventDate?: ISODate
  /** Lunes en que empieza el plan (objetivos sin fecha y carreras/Hyrox) */
  startDate?: ISODate
  /** Duración del bloque para objetivos sin fecha (12 por defecto; se amplía) */
  weeks?: number
}

export const GOAL_LABEL: Record<GoalType, string> = {
  triathlon: 'Triatlón',
  running: 'Carrera a pie',
  hyrox: 'Hyrox',
  strength: 'Fuerza y tono',
  weight_loss: 'Perder peso',
}

export const DISTANCE_LABEL: Record<RunDistance | '70.3', string> = {
  '5k': '5 km',
  '10k': '10 km',
  half: 'Media maratón',
  marathon: 'Maratón',
  '70.3': 'Medio Ironman (70.3)',
}

export const FOCUS_LABEL: Record<StrengthFocus, string> = { tone: 'Tonificar', strength: 'Ganar fuerza', muscle: 'Ganar músculo' }
export const LEVEL_LABEL: Record<Level, string> = { beginner: 'Empiezo de cero', intermediate: 'Tengo algo de base', advanced: 'Entreno habitualmente' }
export const EQUIPMENT_LABEL: Record<HomeEquipment, string> = { gym: 'Gimnasio', dumbbells: 'Casa con mancuernas', none: 'Casa sin material' }

export interface GoalProfile {
  goal?: Goal
  raceDate: ISODate
  raceName: string
  createdAt: string
}

/** Objetivo del perfil; los perfiles antiguos (sin objetivo) son el triatlón 70.3. */
export function goalOf(p: GoalProfile): Goal {
  return p.goal ?? { type: 'triathlon', distance: '70.3', eventName: p.raceName, eventDate: p.raceDate }
}

export const isEventGoal = (g: Goal) => g.type === 'triathlon' || g.type === 'running' || g.type === 'hyrox'

export interface PlanSpec {
  start: ISODate
  weeks: number
  goal: Goal
}

export const DEFAULT_BLOCK_WEEKS = 12
const MAX_WEEKS = 52

/** Inicio y duración del plan según el objetivo. */
export function planSpec(p: GoalProfile): PlanSpec {
  const goal = goalOf(p)
  if (goal.type === 'triathlon') {
    return { start: planStartFromRace(goal.eventDate ?? p.raceDate), weeks: PLAN_WEEKS, goal }
  }
  const start = goal.startDate ?? mondayOf(p.createdAt ? p.createdAt.slice(0, 10) : p.raceDate)
  if (goal.type === 'running' || goal.type === 'hyrox') {
    const raceMonday = mondayOf(goal.eventDate ?? addDays(start, 7 * (DEFAULT_BLOCK_WEEKS - 1)))
    const weeks = Math.min(MAX_WEEKS, Math.max(1, Math.floor(diffDays(raceMonday, start) / 7) + 1))
    return { start, weeks, goal }
  }
  return { start, weeks: goal.weeks ?? DEFAULT_BLOCK_WEEKS, goal }
}

/** Semanas de afinado antes de la prueba según la distancia. */
export function taperWeeks(goal: Goal, weeks: number): number {
  if (weeks < 6) return weeks > 2 ? 1 : 0
  if (goal.type === 'hyrox') return 1
  if (goal.distance === 'marathon') return 3
  if (goal.distance === 'half') return 2
  return 1
}

/** Semana de descarga: cada 4ª, salvo en el afinado y la semana de la prueba. */
export function isRecoveryWeek(goal: Goal, week: number, weeks: number): boolean {
  if (goal.type === 'triathlon') return false // el generador del triatlón lleva su propio calendario
  if (isEventGoal(goal) && week > weeks - taperWeeks(goal, weeks) - 1) return false
  return week % 4 === 0
}

/**
 * Fase de una semana para los objetivos que no son triatlón (el triatlón usa
 * su tabla de fases propia). Se reutilizan los mismos identificadores de fase
 * para los colores, con nombres distintos según el objetivo.
 */
export function phaseFor(goal: Goal, week: number, weeks: number): Phase {
  if (isEventGoal(goal)) {
    if (week >= weeks) return 'race'
    if (week > weeks - 1 - taperWeeks(goal, weeks)) return 'taper'
    const f = week / Math.max(1, weeks - 1 - taperWeeks(goal, weeks))
    if (f <= 0.35) return 'base'
    if (f <= 0.65) return 'build1'
    if (f <= 0.85) return 'build2'
    return 'specific'
  }
  // Fuerza y peso: bloques de 4 semanas que van alternando
  const block = Math.floor((week - 1) / 4)
  if (block === 0) return 'base'
  return block % 2 === 1 ? 'build1' : 'build2'
}

const PHASE_NAMES: Record<GoalType, Partial<Record<Phase, string>>> = {
  triathlon: { base: 'Base', build1: 'Construcción I', build2: 'Construcción II', specific: 'Específica', taper: 'Afinado', race: 'Carrera' },
  running: { base: 'Base', build1: 'Desarrollo', build2: 'Específica', specific: 'Pico', taper: 'Afinado', race: 'Carrera' },
  hyrox: { base: 'Base', build1: 'Desarrollo', build2: 'Específica', specific: 'Simulacros', taper: 'Afinado', race: 'Competición' },
  strength: { base: 'Adaptación', build1: 'Progresión', build2: 'Intensificación' },
  weight_loss: { base: 'Adaptación', build1: 'Progresión', build2: 'Consolidación' },
}

export function phaseLabel(goal: Goal, phase: Phase): string {
  return PHASE_NAMES[goal.type][phase] ?? PHASE_NAMES.triathlon[phase] ?? phase
}

/** Resumen del objetivo en una línea ("Media maratón · 06/12/2026"). */
export function goalSummary(goal: Goal, formatDate: (d: ISODate) => string): string {
  const parts: string[] = []
  if (goal.type === 'running' || goal.type === 'triathlon') parts.push(goal.distance ? DISTANCE_LABEL[goal.distance] : GOAL_LABEL[goal.type])
  else if (goal.type === 'hyrox') parts.push(`Hyrox${goal.division ? ` ${{ open: 'Open', pro: 'Pro', doubles: 'Dobles' }[goal.division]}` : ''}`)
  else if (goal.type === 'strength') parts.push(goal.focus ? FOCUS_LABEL[goal.focus] : GOAL_LABEL.strength)
  else parts.push(GOAL_LABEL.weight_loss)
  if (goal.eventName && isEventGoal(goal)) parts.push(goal.eventName)
  if (goal.eventDate && isEventGoal(goal)) parts.push(formatDate(goal.eventDate))
  return parts.join(' · ')
}

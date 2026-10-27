import type { ISODate } from './dates'

export type Sport = 'swim' | 'bike' | 'run' | 'walk' | 'strength' | 'brick' | 'hyrox' | 'cardio' | 'race' | 'other'
export type Phase = 'base' | 'build1' | 'build2' | 'specific' | 'taper' | 'race'
export type SessionStatus = 'planned' | 'done' | 'skipped' | 'moved'
export type TestType = 'run20' | 'swim400' | 'bike30' | 'run_continuous_min' | 'swim_continuous_m' | 'open_water_m'

export const TEST_LABEL: Record<TestType, { label: string; unit: string; hint: string }> = {
  run20: { label: "Test de carrera 20'", unit: 'm', hint: 'Distancia recorrida en 20 minutos' },
  swim400: { label: 'Test de natación 400 m', unit: 's', hint: 'Tiempo en segundos' },
  bike30: { label: "Test de bici 30'", unit: 'km/h', hint: 'Velocidad media (o potencia si tienes datos)' },
  run_continuous_min: { label: 'Carrera continua', unit: 'min', hint: 'Minutos seguidos corriendo sin caminar' },
  swim_continuous_m: { label: 'Natación seguida', unit: 'm', hint: 'Metros seguidos sin parar' },
  open_water_m: { label: 'Aguas abiertas', unit: 'm', hint: 'Metros nadados en mar, pantano o río' },
}

export type SessionStructure =
  | { kind: 'intervals'; reps: number; onMin: number; offMin: number; warmupMin: number; cooldownMin: number }
  | { kind: 'segments'; segments: { sport: Sport; durationMin: number; note?: string }[] }

/** Un paso de la sesión: un ejercicio de la biblioteca o una indicación libre. */
export interface WorkoutItem {
  exerciseId?: string
  label: string
  sets?: number
  /** "10-12", "30 s", "200 m", "8'"... */
  reps?: string
  restSec?: number
  note?: string
}

export interface WorkoutBlock {
  name: string
  items: WorkoutItem[]
}

export interface SessionDraft {
  date: ISODate
  sport: Sport
  title: string
  description: string
  durationMin: number
  distanceM?: number
  intensityRpe: number
  structure?: SessionStructure
  /** Sesión opcional: no cuenta para la carga ni para la adherencia */
  optional?: boolean
  test?: TestType
  /** Sesión clave de la semana (larga, test, ensayo) */
  key?: boolean
  /** Detalle paso a paso: calentamiento, parte principal, vuelta a la calma */
  blocks?: WorkoutBlock[]
}

export interface WeekDraft {
  weekNumber: number
  startDate: ISODate
  phase: Phase
  isRecovery: boolean
  targetHours: number
  notes: string
  sessions: SessionDraft[]
}

export const SPORT_LABEL: Record<Sport, string> = {
  swim: 'Natación',
  bike: 'Bici',
  run: 'Carrera',
  walk: 'Caminata',
  strength: 'Fuerza',
  brick: 'Brick',
  hyrox: 'Hyrox',
  cardio: 'Cardio',
  race: 'Carrera objetivo',
  other: 'Otro',
}

export const PHASE_LABEL: Record<Phase, string> = {
  base: 'Base',
  build1: 'Construcción I',
  build2: 'Construcción II',
  specific: 'Específica',
  taper: 'Afinado',
  race: 'Carrera',
}

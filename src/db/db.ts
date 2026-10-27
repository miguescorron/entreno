import Dexie, { type EntityTable } from 'dexie'
import type { ISODate } from '../domain/dates'
import type { Phase, SessionStatus, SessionStructure, Sport, TestType } from '../domain/types'

// Modelo de datos de la spec §5 sobre IndexedDB (Dexie).
// Las migraciones se versionan con db.version(n).

export type Sex = 'male' | 'female'

export interface Profile {
  id?: number
  name: string
  sex: Sex
  birthDate: ISODate
  heightCm: number
  startWeightKg: number
  goalWeightKg: number
  raceName: string
  raceDate: ISODate
  weeklyHoursAvailable: number
  availableDays: number[]
  preferredTime: string
  swimCrawl: 'no' | 'basic' | 'good'
  swimContinuousM: number
  poolNearby: boolean
  bikeType: 'none' | 'road' | 'gravel' | 'mtb' | 'other'
  hasHelmet: boolean
  hasTrainer: boolean
  device: 'none' | 'apple_watch' | 'garmin' | 'other'
  injuriesNotes: string
  medicalCheckDone: boolean
  allergies: string
  dietNotes: string
  mealTimes: string
  createdAt: string
}

export interface PlanWeek {
  id?: number
  weekNumber: number
  startDate: ISODate
  phase: Phase
  isRecovery: boolean
  targetHours: number
  notes: string
}

export interface PlanSession {
  id?: number
  weekNumber: number
  date: ISODate
  sport: Sport
  title: string
  description: string
  durationMin: number
  distanceM?: number
  intensityRpe: number
  structure?: SessionStructure
  optional?: boolean
  test?: TestType
  key?: boolean
  status: SessionStatus
  movedFromDate?: ISODate
}

export interface WorkoutSegment {
  sport: Sport
  durationMin: number
  distanceM?: number
}

export interface WorkoutLog {
  id?: number
  planSessionId?: number
  date: ISODate
  sport: Sport
  durationMin: number
  distanceM?: number
  avgHr?: number
  rpe: number
  feelingText?: string
  painZone?: string
  painLevel?: number
  weatherNote?: string
  notes?: string
  segments?: WorkoutSegment[]
  isExtra: boolean
  createdAt: string
}

export type SkipReason = 'cansancio' | 'trabajo' | 'enfermedad' | 'lesion' | 'otro'

export interface SkipLog {
  id?: number
  planSessionId: number
  date: ISODate
  reasonCategory: SkipReason
  reasonText?: string
}

export interface BodyLog {
  id?: number
  date: ISODate
  weightKg: number
  waistCm?: number
  note?: string
}

export interface Checkin {
  id?: number
  date: ISODate
  sleepHours?: number
  sleepQuality?: number
  energy?: number
  mood?: number
  soreness?: number
  painZone?: string
  painLevel?: number
  freeText?: string
}

// Tablas de fases posteriores (B-D): se crean ya para no migrar después.
export interface FoodItem {
  id?: number
  name: string
  brand?: string
  kcal100g: number
  protein100g: number
  carbs100g: number
  fat100g: number
  fiber100g?: number
  source: 'off' | 'manual' | 'ai' | 'base'
  barcode?: string
  /** Porción habitual aprendida al corregir gramos */
  usualGrams?: number
  servingGrams?: number
  lastUsedAt?: string
  /** Grado de procesado NOVA (1 sin procesar … 4 ultraprocesado), de Open Food Facts */
  novaGroup?: 1 | 2 | 3 | 4
}

export interface MealLog {
  id?: number
  date: ISODate
  mealType: 'desayuno' | 'comida' | 'cena' | 'snack' | 'entreno'
  name: string
  grams?: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  source: 'photo' | 'label' | 'barcode' | 'text' | 'manual' | 'favorite'
  /** Origen de los valores nutricionales */
  dataSource?: 'ai' | 'off' | 'manual' | 'base'
  foodItemId?: number
  /** Agrupa los platos de una misma foto o frase */
  groupId?: string
  photoBlob?: Blob
  confidence?: number
  gramsRange?: [number, number]
  assumptions?: string[]
  notes?: string
}

export interface MealTemplateItem {
  name: string
  grams?: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  foodItemId?: number
  dataSource?: MealLog['dataSource']
}

export interface MealTemplate {
  id?: number
  name: string
  mealType?: MealLog['mealType']
  items: MealTemplateItem[]
  lastUsedAt?: string
}

export interface HydrationLog {
  id?: number
  date: ISODate
  ml: number
  sodiumMg?: number
  context: 'day' | 'training'
}

export interface NutritionTarget {
  id?: number
  date: ISODate
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  dayType: 'rest' | 'short' | 'long' | 'race'
}

export interface MilestoneRow {
  id?: number
  key: string
  status: 'pending' | 'ahead' | 'on_track' | 'behind' | 'done'
  evaluatedAt?: string
  note?: string
}

export interface TestResult {
  id?: number
  date: ISODate
  type: TestType
  value: number
  unit: string
  note?: string
}

export interface ChatMessage {
  id?: number
  ts: string
  /** 'tool' = mensaje de usuario con tool_results (no se muestra) */
  role: 'user' | 'assistant' | 'tool'
  /** Texto que se muestra en el chat */
  text: string
  /** Sesión de conversación con la API; al compactar empieza otra */
  sessionId?: string
  /** Bloques exactos enviados/recibidos, para reenviar el historial sin editarlo */
  blocks?: unknown[]
  /** Tarjetas de lo que el coach ha guardado o propuesto en este turno */
  actions?: CoachAction[]
  extractedJson?: unknown
}

export interface CoachAction {
  kind: 'workout' | 'checkin' | 'skip' | 'meal' | 'proposal' | 'alarm'
  summary: string
  /** Para deshacer: qué filas se crearon y el estado previo */
  undo?: { table: string; ids?: number[]; restore?: unknown; sessionId?: number }
  alerts?: { key: string; id: string; title: string; message: string }[]
  proposalId?: number
  undone?: boolean
  confirmed?: boolean
}

export type ProposalKind = 'move' | 'modify' | 'remove' | 'reduce_week' | 'repeat_week'

export interface PlanProposal {
  id?: number
  createdAt: string
  kind: ProposalKind
  sessionId?: number
  newDate?: ISODate
  newDurationMin?: number
  newTitle?: string
  newDescription?: string
  week?: number
  percent?: number
  reason: string
  summary: string
  status: 'pending' | 'accepted' | 'rejected'
  decidedAt?: string
}

export interface WeeklyReview {
  id?: number
  weekNumber: number
  summaryText: string
  adjustmentsJson?: unknown
  accepted?: boolean
  createdAt: string
}

export interface Setting {
  key: string
  value: unknown
}

export class EntrenoDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>
  planWeeks!: EntityTable<PlanWeek, 'id'>
  planSessions!: EntityTable<PlanSession, 'id'>
  workoutLogs!: EntityTable<WorkoutLog, 'id'>
  skipLogs!: EntityTable<SkipLog, 'id'>
  bodyLogs!: EntityTable<BodyLog, 'id'>
  checkins!: EntityTable<Checkin, 'id'>
  foodItems!: EntityTable<FoodItem, 'id'>
  mealLogs!: EntityTable<MealLog, 'id'>
  hydrationLogs!: EntityTable<HydrationLog, 'id'>
  nutritionTargets!: EntityTable<NutritionTarget, 'id'>
  milestones!: EntityTable<MilestoneRow, 'id'>
  testResults!: EntityTable<TestResult, 'id'>
  chatMessages!: EntityTable<ChatMessage, 'id'>
  weeklyReviews!: EntityTable<WeeklyReview, 'id'>
  mealTemplates!: EntityTable<MealTemplate, 'id'>
  planProposals!: EntityTable<PlanProposal, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'entreno') {
    super(name)
    this.version(1).stores({
      profile: '++id',
      planWeeks: '++id, &weekNumber',
      planSessions: '++id, weekNumber, date, status',
      workoutLogs: '++id, planSessionId, date',
      skipLogs: '++id, planSessionId, date',
      bodyLogs: '++id, date',
      checkins: '++id, &date',
      foodItems: '++id, name, barcode',
      mealLogs: '++id, date',
      hydrationLogs: '++id, date',
      nutritionTargets: '++id, &date',
      milestones: '++id, &key',
      testResults: '++id, date, type',
      chatMessages: '++id, ts',
      weeklyReviews: '++id, weekNumber',
      settings: '&key',
    })
    this.version(2).stores({
      mealLogs: '++id, date, groupId',
      mealTemplates: '++id, name',
    })
    this.version(3).stores({
      chatMessages: '++id, ts, sessionId',
      planProposals: '++id, status, createdAt',
    })
  }
}

export const db = new EntrenoDB()

export const TABLE_NAMES = [
  'profile',
  'planWeeks',
  'planSessions',
  'workoutLogs',
  'skipLogs',
  'bodyLogs',
  'checkins',
  'foodItems',
  'mealLogs',
  'hydrationLogs',
  'nutritionTargets',
  'milestones',
  'testResults',
  'chatMessages',
  'weeklyReviews',
  'mealTemplates',
  'planProposals',
  'settings',
] as const

/** Ajustes que nunca salen del dispositivo en un export. */
export const SECRET_SETTINGS = new Set(['anthropicApiKey'])

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return (row?.value as T) ?? fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}

import { addDays, weekdayIndex, weekStart, type ISODate } from '../dates'
import { adaptToEquipment, type Equipment, type Pattern } from '../exercises'
import { goalOf, isRecoveryWeek, phaseFor, planSpec, taperWeeks, type Goal, type GoalProfile, type HomeEquipment, type Level, type RunDistance } from '../goals'
import type { Phase, SessionDraft, WorkoutBlock, WorkoutItem } from '../types'
import { fmtMin, generatePlan, weekLoadMin } from './generator'

// Plan según el objetivo. El triatlón 70.3 reutiliza su generador (spec §7) y
// solo se le añade el detalle de cada sesión. El resto de objetivos se
// generan aquí con las mismas reglas de fondo: progresión gradual, descarga
// cada 4ª semana y ejercicios adaptados al material y al nivel.

export interface GoalPlanProfile extends GoalProfile {
  availableDays: number[]
  weeklyHoursAvailable: number
  level?: Level
  equipment?: HomeEquipment
  sessionMinutes?: number
}

export interface PlanWeek {
  weekNumber: number
  startDate: ISODate
  phase: Phase
  isRecovery: boolean
  targetHours: number
  notes: string
  sessions: SessionDraft[]
}

type Slot = Omit<SessionDraft, 'date'> & { day: number }

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1)

// ---------- utilidades comunes ----------

/** Elige n días de los disponibles lo más repartidos posible en la semana. */
export function spreadDays(available: number[], n: number): number[] {
  const days = [...new Set(available)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (n <= 0) return []
  if (days.length <= n) return days
  let best: number[] = days.slice(0, n)
  let bestScore = -1
  const minGap = (c: number[]) => Math.min(...c.map((d, i) => (i ? d - c[i - 1] : d + 7 - c[c.length - 1])))
  const rec = (start: number, acc: number[]) => {
    if (acc.length === n) {
      const score = minGap(acc) * 10 - (acc.includes(6) || acc.includes(5) ? 0 : 1)
      if (score > bestScore) {
        bestScore = score
        best = [...acc]
      }
      return
    }
    for (let i = start; i < days.length; i++) rec(i + 1, [...acc, days[i]])
  }
  rec(0, [])
  return best
}

function item(id: string, equipment: Equipment, sets: number, reps: string, restSec?: number, note?: string): WorkoutItem {
  const e = adaptToEquipment(id, equipment)
  return { exerciseId: e.id, label: e.name, sets, reps, restSec, note }
}

const text = (label: string, reps?: string, note?: string): WorkoutItem => ({ label, reps, note })

function warmup(equipment: Equipment, extra: string[] = ['gato_camello', 'mov_cadera']): WorkoutBlock {
  return {
    name: 'Calentamiento',
    items: [item('activacion_general', equipment, 1, "5'"), ...extra.map((id) => item(id, equipment, 1, '8-10'))],
  }
}

function cooldown(equipment: Equipment): WorkoutBlock {
  return { name: 'Vuelta a la calma', items: [item('estiramientos', equipment, 1, "5'")] }
}

/** Minutos aproximados de un bloque principal de fuerza. */
function strengthMinutes(items: WorkoutItem[]): number {
  return items.reduce((a, i) => a + (i.sets ?? 1) * (0.75 + (i.restSec ?? 60) / 60), 0)
}

function finishWeek(weekNumber: number, start: ISODate, phase: Phase, isRecovery: boolean, slots: Slot[], notes: string[]): PlanWeek {
  const sessions = slots.sort((a, b) => a.day - b.day).map(({ day, ...s }) => ({ ...s, date: addDays(start, day) }))
  return {
    weekNumber,
    startDate: start,
    phase,
    isRecovery,
    targetHours: Math.round((weekLoadMin(sessions) / 60) * 10) / 10,
    notes: notes.filter(Boolean).join(' '),
    sessions,
  }
}

function equipmentOf(p: GoalPlanProfile): HomeEquipment {
  return p.equipment ?? 'dumbbells'
}

// ---------- fuerza ----------

/** Ejercicio por patrón según material, nivel y bloque (se rota cada 4 semanas). */
const CHOICES: Partial<Record<Pattern | 'glute_main' | 'single_leg', Record<HomeEquipment, string[]>>> = {
  squat: { gym: ['sentadilla_barra', 'prensa'], dumbbells: ['sentadilla_goblet', 'bulgara'], none: ['sentadilla_pc', 'bulgara'] },
  hinge: { gym: ['rumano_barra', 'rumano_mancuernas'], dumbbells: ['rumano_mancuernas', 'rumano_una_pierna'], none: ['rumano_una_pierna', 'puente_gluteo'] },
  lunge: { gym: ['zancada_mancuernas', 'bulgara'], dumbbells: ['zancada_mancuernas', 'step_up'], none: ['zancada_atras', 'step_up'] },
  glute_main: { gym: ['hip_thrust', 'puente_gluteo'], dumbbells: ['hip_thrust', 'puente_gluteo'], none: ['puente_gluteo', 'patada_gluteo'] },
  push_h: { gym: ['press_banca', 'press_mancuernas'], dumbbells: ['press_mancuernas', 'flexion'], none: ['flexion', 'flexion_inclinada'] },
  push_v: { gym: ['press_hombro', 'press_hombro'], dumbbells: ['press_hombro', 'pike_push_up'], none: ['pike_push_up', 'pike_push_up'] },
  pull_h: { gym: ['remo_polea', 'remo_barra'], dumbbells: ['remo_mancuerna', 'remo_banda'], none: ['remo_invertido', 'remo_banda'] },
  pull_v: { gym: ['jalon', 'dominada_asistida'], dumbbells: ['pullover', 'remo_mancuerna'], none: ['remo_banda', 'remo_invertido'] },
  core: { gym: ['plancha', 'pallof'], dumbbells: ['plancha', 'dead_bug'], none: ['plancha', 'dead_bug'] },
  calf: { gym: ['gemelo', 'gemelo'], dumbbells: ['gemelo', 'gemelo'], none: ['gemelo', 'gemelo'] },
  glute: { gym: ['patada_gluteo', 'monster_walk'], dumbbells: ['patada_gluteo', 'monster_walk'], none: ['patada_gluteo', 'patada_gluteo'] },
  arms: { gym: ['curl_biceps', 'fondos_silla'], dumbbells: ['curl_biceps', 'fondos_silla'], none: ['fondos_silla', 'fondos_silla'] },
  shoulders: { gym: ['elevacion_lateral', 'elevacion_lateral'], dumbbells: ['elevacion_lateral', 'elevacion_lateral'], none: ['pike_push_up', 'pike_push_up'] },
  single_leg: { gym: ['bulgara', 'step_up'], dumbbells: ['bulgara', 'step_up'], none: ['bulgara', 'step_up'] },
}

function choose(pattern: keyof typeof CHOICES, eq: HomeEquipment, level: Level, block: number): string {
  const list = CHOICES[pattern]![eq]
  // Principiantes: la variante más sencilla del primer bloque durante 8 semanas
  const idx = level === 'beginner' && block < 2 ? (pattern === 'squat' && eq === 'gym' ? 1 : 0) : block % list.length
  return list[idx]
}

type Template = { name: string; slots: (keyof typeof CHOICES)[] }

function strengthTemplates(n: number): Template[] {
  const A: Template = { name: 'Cuerpo completo A', slots: ['squat', 'push_h', 'hinge', 'pull_h', 'core', 'glute', 'arms'] }
  const B: Template = { name: 'Cuerpo completo B', slots: ['lunge', 'pull_v', 'glute_main', 'push_v', 'core', 'calf', 'shoulders'] }
  const C: Template = { name: 'Cuerpo completo C', slots: ['single_leg', 'push_h', 'hinge', 'pull_h', 'core', 'arms', 'glute'] }
  const U: Template = { name: 'Tren superior', slots: ['push_h', 'pull_h', 'push_v', 'pull_v', 'arms', 'shoulders', 'core'] }
  const L: Template = { name: 'Tren inferior', slots: ['squat', 'hinge', 'lunge', 'glute_main', 'calf', 'core', 'glute'] }
  if (n <= 2) return [A, B]
  if (n === 3) return [A, B, C]
  if (n === 4) return [U, L, { ...U, name: 'Tren superior B' }, { ...L, name: 'Tren inferior B' }]
  return [U, L, A, { ...U, name: 'Tren superior B' }, { ...L, name: 'Tren inferior B' }]
}

interface StrengthDose {
  reps: string
  restSec: number
  sets: number
  rir: string
}

function strengthDose(focus: Goal['focus'], level: Level, weekInBlock: number, recovery: boolean): StrengthDose {
  const base = focus === 'strength' ? { reps: level === 'beginner' ? '8-10' : '5-8', restSec: 150 } : focus === 'muscle' ? { reps: '8-12', restSec: 90 } : { reps: '12-15', restSec: 60 }
  const sets = (level === 'beginner' ? 2 : level === 'intermediate' ? 3 : 4) + (weekInBlock >= 2 && !recovery ? 1 : 0)
  if (recovery) return { ...base, sets: Math.max(2, sets - 1), rir: 'RIR 4: descarga, un 20 % menos de peso' }
  const rir = ['RIR 3', 'RIR 2', 'RIR 1-2'][Math.min(2, weekInBlock)]
  return { ...base, sets: Math.min(sets, 5), rir }
}

function coreReps(id: string): string {
  return id === 'plancha' || id === 'plancha_lateral' ? '30-45 s' : '8-10 por lado'
}

function strengthSession(day: number, tpl: Template, eq: HomeEquipment, level: Level, block: number, dose: StrengthDose, minutes: number, title?: string): Slot {
  const makeItem = (pattern: keyof typeof CHOICES, sets: number): WorkoutItem => {
    const id = choose(pattern, eq, level, block)
    const isCore = pattern === 'core'
    const accessory = pattern === 'calf' || pattern === 'glute' || pattern === 'arms' || pattern === 'shoulders'
    return item(id, eq, isCore || accessory ? Math.max(2, sets - 1) : sets, isCore ? coreReps(id) : accessory ? '12-15' : dose.reps, isCore || accessory ? 45 : dose.restSec, isCore ? undefined : dose.rir)
  }
  // Se llena el tiempo elegido: primero con más ejercicios, después con una serie más
  const budget = minutes - 10 // calentamiento y vuelta a la calma
  let count = minutes <= 30 ? 4 : 5
  let sets = dose.sets
  let main = tpl.slots.slice(0, count).map((p) => makeItem(p, sets))
  while (strengthMinutes(main) < budget - 4 && count < tpl.slots.length) {
    count++
    main = tpl.slots.slice(0, count).map((p) => makeItem(p, sets))
  }
  const maxSets = dose.rir.startsWith('RIR 4') ? dose.sets : dose.sets + 1
  while (strengthMinutes(main) < budget - 4 && sets < maxSets) {
    sets++
    main = tpl.slots.slice(0, count).map((p) => makeItem(p, sets))
  }
  while (strengthMinutes(main) > budget + 3 && count > 3) {
    count--
    main = tpl.slots.slice(0, count).map((p) => makeItem(p, sets))
  }
  // Si aún sobra tiempo (principiantes con sesiones largas), cardio suave al final
  const left = Math.round(budget - strengthMinutes(main))
  const finisher: WorkoutBlock[] =
    left >= 6 ? [{ name: 'Final: cardio suave', items: [item(eq === 'gym' ? 'cardio_maquina' : 'paseo_rapido', eq, 1, `${Math.min(20, round5(left))}'`, undefined, 'Zona 2: puedes hablar')] }] : []
  const blocks: WorkoutBlock[] = [warmup(eq), { name: 'Parte principal', items: main }, ...finisher, cooldown(eq)]
  const durationMin = round5(10 + strengthMinutes(main) + (finisher.length ? Math.min(20, round5(left)) : 0))
  const name = tpl.name.charAt(0).toLowerCase() + tpl.name.slice(1)
  return {
    day,
    sport: 'strength',
    title: title ?? `Fuerza: ${name}`,
    description: `${sets} series de ${dose.reps} repeticiones por ejercicio (${dose.rir}). Descanso ${dose.restSec >= 90 ? `${Math.round((dose.restSec / 60) * 10) / 10} min` : `${dose.restSec} s`} entre series. Si terminas una serie con más repeticiones de las indicadas, sube el peso la próxima vez.`,
    durationMin,
    intensityRpe: dose.rir.startsWith('RIR 4') ? 5 : 7,
    blocks,
  }
}

function cardioSession(day: number, eq: HomeEquipment, minutes: number, optional: boolean, intervals?: { reps: number; on: number; off: number }): Slot {
  const id = eq === 'gym' ? 'cardio_maquina' : 'paseo_rapido'
  const main: WorkoutItem[] = intervals
    ? [item('intervalos', eq, intervals.reps, `${intervals.on}' rápido + ${intervals.off}' suave`, undefined, 'Rápido: respiración fuerte. Suave: recuperas.')]
    : [item(id, eq, 1, `${minutes}'`, undefined, 'Zona 2: puedes hablar con frases cortas')]
  return {
    day,
    sport: 'cardio',
    title: intervals ? `Cardio por intervalos ${intervals.reps}×(${intervals.on}'+${intervals.off}')` : `${id === 'paseo_rapido' ? 'Paseo rápido' : 'Cardio suave'} ${fmtMin(minutes)}`,
    description: intervals
      ? `5' suave, ${intervals.reps} veces ${intervals.on}' rápido + ${intervals.off}' suave, 5' suave.`
      : 'Ritmo constante en el que puedas hablar. Es la base que más grasa quema sin fatigarte para la fuerza.',
    durationMin: intervals ? intervals.reps * (intervals.on + intervals.off) + 10 : minutes,
    intensityRpe: intervals ? 7 : 4,
    optional,
    blocks: intervals
      ? [{ name: 'Calentamiento', items: [text('Suave', "5'")] }, { name: 'Parte principal', items: main }, { name: 'Vuelta a la calma', items: [text('Suave', "5'")] }]
      : [{ name: 'Sesión', items: main }],
  }
}

export function strengthPlan(p: GoalPlanProfile): PlanWeek[] {
  const spec = planSpec(p)
  const goal = spec.goal
  const level = p.level ?? 'beginner'
  const eq = equipmentOf(p)
  const minutes = p.sessionMinutes ?? 45
  const target = level === 'beginner' ? 3 : level === 'intermediate' ? 4 : 5
  const days = spreadDays(p.availableDays, Math.max(2, Math.min(target, p.availableDays.length)))
  const templates = strengthTemplates(days.length)
  const free = p.availableDays.filter((d) => !days.includes(d))
  const out: PlanWeek[] = []
  for (let w = 1; w <= spec.weeks; w++) {
    const recovery = isRecoveryWeek(goal, w, spec.weeks)
    const block = Math.floor((w - 1) / 4)
    const dose = strengthDose(goal.focus, level, (w - 1) % 4, recovery)
    const slots: Slot[] = days.map((d, i) => strengthSession(d, templates[i % templates.length], eq, level, block, dose, minutes))
    // Cardio suave opcional en días libres: salud y gasto sin robar recuperación
    free.slice(0, goal.focus === 'tone' ? 2 : 1).forEach((d) => slots.push(cardioSession(d, eq, recovery ? 25 : clamp(25 + w * 2, 25, 45), true)))
    out.push(
      finishWeek(w, weekStart(spec.start, w), phaseFor(goal, w, spec.weeks), recovery, slots, [
        recovery ? 'Semana de descarga: menos series y menos peso. Recupera para seguir progresando.' : '',
        w % 4 === 1 && w > 1 ? 'Nuevo bloque: algunos ejercicios cambian de variante.' : '',
        'Objetivo diario: 8.000 pasos.',
      ]),
    )
  }
  return out
}

// ---------- perder peso ----------

export function weightLossPlan(p: GoalPlanProfile): PlanWeek[] {
  const spec = planSpec(p)
  const goal = spec.goal
  const level = p.level ?? 'beginner'
  const eq = equipmentOf(p)
  const minutes = p.sessionMinutes ?? 45
  const n = Math.max(3, Math.min(5, p.availableDays.length))
  const days = spreadDays(p.availableDays, n)
  const strengthCount = n >= 4 ? 3 : 2
  const strengthDays = spreadDays(days, strengthCount)
  const cardioDays = days.filter((d) => !strengthDays.includes(d))
  const templates = strengthTemplates(strengthCount === 3 ? 3 : 2)
  const out: PlanWeek[] = []
  for (let w = 1; w <= spec.weeks; w++) {
    const recovery = isRecoveryWeek(goal, w, spec.weeks)
    const block = Math.floor((w - 1) / 4)
    const dose = strengthDose('tone', level, (w - 1) % 4, recovery)
    const slots: Slot[] = strengthDays.map((d, i) => strengthSession(d, templates[i], eq, level, block, { ...dose, restSec: 45 }, Math.min(minutes, 50)))
    const startMin = level === 'beginner' ? 25 : 35
    const zone2 = recovery ? startMin : round5(Math.min(minutes + 15, startMin + w * 2.5))
    cardioDays.forEach((d, i) => {
      // Desde la semana 5 (o 3 si ya tiene base), una sesión de intervalos por semana
      const useIntervals = !recovery && i === 0 && cardioDays.length > 1 && w >= (level === 'beginner' ? 7 : 3)
      slots.push(cardioSession(d, eq, zone2, false, useIntervals ? { reps: clamp(4 + Math.floor(w / 3), 4, 8), on: level === 'advanced' ? 2 : 1, off: 2 } : undefined))
    })
    out.push(
      finishWeek(w, weekStart(spec.start, w), phaseFor(goal, w, spec.weeks), recovery, slots, [
        recovery ? 'Semana de descarga: menos intensidad, misma constancia.' : '',
        'Objetivo diario: 8.000-10.000 pasos. La fuerza mantiene el músculo mientras pierdes grasa.',
      ]),
    )
  }
  return out
}

// ---------- carrera a pie ----------

const LONG_PEAK_MIN: Record<RunDistance, number> = { '5k': 50, '10k': 75, half: 110, marathon: 170 }
const RACE_KM: Record<RunDistance, number> = { '5k': 5, '10k': 10, half: 21.1, marathon: 42.2 }

function runBlocks(eq: Equipment, mainItems: WorkoutItem[], drills = false): WorkoutBlock[] {
  return [
    { name: 'Calentamiento', items: [text('Trote muy suave o caminata rápida', "10'"), ...(drills ? [item('skipping', eq, 2, '20 m')] : [])] },
    { name: 'Parte principal', items: mainItems },
    { name: 'Vuelta a la calma', items: [text('Trote suave o caminar', "5'"), item('estiramientos', eq, 1, "5'")] },
  ]
}

function runQuality(phase: Phase, distance: RunDistance, w: number): { title: string; desc: string; items: WorkoutItem[]; work: number; rpe: number } {
  if (phase === 'base') return { title: 'Rodaje con aceleraciones', desc: 'Rodaje suave y al final 6 aceleraciones de 20" con recuperación completa.', items: [text('Rodaje suave', "20'"), { exerciseId: 'strides', label: 'Aceleraciones (strides)', sets: 6, reps: '20"', restSec: 60 }], work: 26, rpe: 5 }
  if (phase === 'build1') {
    const t = 8 + (w % 3) * 2
    return { title: `Tempo 2×${t}'`, desc: `2 bloques de ${t}' a ritmo cómodo-duro (puedes decir frases cortas), 3' suaves entre medias.`, items: [text('Ritmo tempo (RPE 6-7)', `${t}'`, '3\' suave entre bloques'), text('Ritmo tempo (RPE 6-7)', `${t}'`)], work: 2 * t + 3, rpe: 7 }
  }
  const reps: Record<RunDistance, { n: number; d: string; rest: string; min: number }> = {
    '5k': { n: 6, d: '800 m', rest: "2'", min: 4 },
    '10k': { n: 5, d: '1 km', rest: "2'", min: 5 },
    half: { n: 3, d: '2 km a ritmo de media', rest: "3'", min: 10 },
    marathon: { n: 2, d: '5 km a ritmo de maratón', rest: "4'", min: 26 },
  }
  const r = reps[distance]
  return { title: `Series ${r.n}×${r.d}`, desc: `${r.n} repeticiones de ${r.d} con ${r.rest} de trote suave entre cada una.`, items: [{ label: `${r.d} rápido`, sets: r.n, reps: r.d, note: `${r.rest} suave entre series` }], work: r.n * r.min + (r.n - 1) * 3, rpe: 8 }
}

function runnerStrength(day: number, eq: HomeEquipment, sets: number): Slot {
  const items = [
    item(eq === 'gym' ? 'sentadilla_goblet' : eq === 'dumbbells' ? 'sentadilla_goblet' : 'sentadilla_pc', eq, sets, '10-12', 60, 'RIR 2-3'),
    item('rumano_una_pierna', eq, sets, '8 por pierna', 60),
    item('step_up', eq, sets, '10 por pierna', 60),
    item('gemelo', eq, sets, '15', 45, 'Baja lento en 3 segundos'),
    item('puente_gluteo', eq, sets, '12-15', 45),
    item('plancha_lateral', eq, 2, '30 s por lado', 30),
  ]
  return { day, sport: 'strength', title: 'Fuerza para corredores', description: 'Previene lesiones y mejora la economía de carrera. Peso moderado, técnica perfecta.', durationMin: round5(10 + strengthMinutes(items)), intensityRpe: 6, blocks: [warmup(eq, ['mov_cadera']), { name: 'Parte principal', items }, cooldown(eq)] }
}

export function runningPlan(p: GoalPlanProfile): PlanWeek[] {
  const spec = planSpec(p)
  const goal = spec.goal
  const distance = (goal.distance as RunDistance) ?? '10k'
  const level = p.level ?? 'beginner'
  const eq = equipmentOf(p)
  const runCount = clamp(level === 'beginner' ? 3 : level === 'intermediate' ? 4 : 5, 2, Math.max(2, p.availableDays.length - 1))
  const runDays = spreadDays(p.availableDays, runCount)
  // La tirada larga, en fin de semana si se puede
  const longDay = [...runDays].reverse().find((d) => d >= 5) ?? runDays[runDays.length - 1]
  const qualityDay = runDays.find((d) => Math.abs(d - longDay) >= 2 && d !== longDay) ?? runDays[0]
  const strengthDays = spreadDays(p.availableDays.filter((d) => !runDays.includes(d)), 2)
  const taper = taperWeeks(goal, spec.weeks)
  const peakWeek = Math.max(1, spec.weeks - 1 - taper)
  const startLong = level === 'beginner' ? 20 : level === 'intermediate' ? 35 : 50
  const peak = LONG_PEAK_MIN[distance] * (level === 'beginner' ? 0.85 : 1)
  const maxMin = p.weeklyHoursAvailable * 60
  const out: PlanWeek[] = []
  let lastLong = startLong
  const raceWeekday = goal.eventDate ? weekdayIndex(goal.eventDate) : 6

  for (let w = 1; w <= spec.weeks; w++) {
    const phase = phaseFor(goal, w, spec.weeks)
    const recovery = isRecoveryWeek(goal, w, spec.weeks)
    const slots: Slot[] = []

    if (phase === 'race') {
      runDays.filter((d) => d < raceWeekday).slice(-2).forEach((d, i) => slots.push({ day: d, sport: 'run', title: i ? "Activación 15'" : "Rodaje suave 25'", description: i ? 'Muy suave con 3 aceleraciones cortas. Prepara la ropa y el dorsal.' : 'Suave, piernas sueltas.', durationMin: i ? 15 : 25, intensityRpe: 3, blocks: runBlocks(eq, [text('Trote suave', i ? "10'" : "20'")], true) }))
      slots.push({ day: raceWeekday, sport: 'race', title: goal.eventName || `Carrera de ${RACE_KM[distance]} km`, description: 'Sal más lento de lo que te pide el cuerpo los primeros kilómetros. Desayuno probado, nada nuevo hoy.', durationMin: Math.round(RACE_KM[distance] * 6), distanceM: RACE_KM[distance] * 1000, intensityRpe: 9, key: true })
      out.push(finishWeek(w, weekStart(spec.start, w), phase, false, slots, ['Semana de la prueba: descansa, duerme y come hidratos los 2 días previos.']))
      continue
    }

    // Tirada larga: progresión lineal con tope de +10 % y descargas
    let long = round5(lerp(startLong, peak, (w - 1) / Math.max(1, peakWeek - 1)))
    long = Math.min(long, round5(lastLong * 1.1) || long)
    if (phase === 'taper') long = round5(peak * (spec.weeks - w === 1 ? 0.5 : 0.7))
    if (recovery) long = round5(long * 0.7)
    else if (phase !== 'taper') lastLong = long
    const easy = round5(clamp(long * 0.6, 20, 60))
    // Principiantes: trote y caminata alternos hasta que el rodaje sea continuo
    const runWalk = level === 'beginner' && w <= 8

    runDays.forEach((d) => {
      if (d === longDay) {
        slots.push({
          day: d,
          sport: 'run',
          title: runWalk ? `Trote/caminata ${fmtMin(long)}` : `Tirada larga ${fmtMin(long)}`,
          description: runWalk ? `Alterna ${Math.min(10, 1 + w)}' trotando y 1' caminando. Ritmo en el que puedas hablar.` : 'Ritmo muy cómodo, puedes hablar. Es la sesión más importante de la semana.',
          durationMin: long,
          distanceM: Math.round((long / (level === 'beginner' ? 7.5 : 6)) * 10) * 100,
          intensityRpe: 4,
          key: true,
          blocks: runBlocks(eq, [runWalk ? { exerciseId: 'trote_caminata', label: 'Trote y caminata alternos', reps: `${Math.min(10, 1 + w)}' + 1'`, note: `Hasta completar ${fmtMin(long - 15)}` } : text('Rodaje continuo suave (RPE 4)', fmtMin(Math.max(10, long - 15)))]),
        })
      } else if (d === qualityDay && !recovery && phase !== 'taper' && !(level === 'beginner' && phase === 'base')) {
        const q = runQuality(phase, distance, w)
        slots.push({ day: d, sport: 'run', title: q.title, description: q.desc, durationMin: round5(q.work + 15), intensityRpe: q.rpe, blocks: runBlocks(eq, q.items, true) })
      } else {
        slots.push({
          day: d,
          sport: 'run',
          title: runWalk ? `Trote/caminata ${fmtMin(easy)}` : `Rodaje suave ${fmtMin(easy)}`,
          description: runWalk ? `Alterna ${Math.min(8, w)}' trotando y 2' caminando.` : 'Suave de verdad: si dudas, más lento.',
          durationMin: easy,
          intensityRpe: 4,
          blocks: runBlocks(eq, [runWalk ? { exerciseId: 'trote_caminata', label: 'Trote y caminata alternos', reps: `${Math.min(8, w)}' + 2'` } : text('Rodaje suave (RPE 3-4)', fmtMin(Math.max(10, easy - 15)))]),
        })
      }
    })
    strengthDays.slice(0, phase === 'taper' ? 1 : level === 'beginner' ? 1 : 2).forEach((d) => slots.push(runnerStrength(d, eq, recovery || phase === 'taper' ? 2 : 3)))
    capMinutes(slots, maxMin)
    out.push(finishWeek(w, weekStart(spec.start, w), phase, recovery, slots, [recovery ? 'Semana de descarga: menos volumen para asimilar.' : '', phase === 'taper' ? 'Afinado: menos volumen, mantén algo de ritmo.' : '']))
  }
  return out
}

/** Recorta por igual las sesiones de cardio si la semana se pasa del tiempo disponible. */
function capMinutes(slots: Slot[], maxMin: number) {
  const total = weekLoadMin(slots)
  if (total <= maxMin) return
  const flexible = slots.filter((s) => s.sport !== 'strength' && s.sport !== 'race' && !s.optional)
  const fixed = total - weekLoadMin(flexible)
  const f = Math.max(0.5, (maxMin - fixed) / Math.max(1, total - fixed))
  for (const s of flexible) s.durationMin = round5(s.durationMin * f)
}

// ---------- Hyrox ----------

const STATIONS: { id: string; full: string }[] = [
  { id: 'skierg', full: '1.000 m' },
  { id: 'sled_push', full: '50 m' },
  { id: 'sled_pull', full: '50 m' },
  { id: 'burpee_salto', full: '80 m' },
  { id: 'remoergometro', full: '1.000 m' },
  { id: 'farmers', full: '200 m' },
  { id: 'sandbag_lunges', full: '100 m' },
  { id: 'wall_ball', full: '100 repeticiones' },
]

function stationDose(id: string, fraction: number): string {
  const f = clamp(fraction, 0.25, 1)
  switch (id) {
    case 'skierg':
    case 'remoergometro':
      return `${round5(1000 * f / 10) * 10} m`
    case 'sled_push':
    case 'sled_pull':
      return `${Math.round(50 * f / 5) * 5} m`
    case 'burpee_salto':
      return `${Math.round(80 * f / 10) * 10} m`
    case 'farmers':
      return `${Math.round(200 * f / 25) * 25} m`
    case 'sandbag_lunges':
      return `${Math.round(100 * f / 10) * 10} m`
    case 'wall_ball':
      return `${Math.round(100 * f / 5) * 5} repeticiones`
    default:
      return ''
  }
}

export function hyroxPlan(p: GoalPlanProfile): PlanWeek[] {
  const spec = planSpec(p)
  const goal = spec.goal
  const level = p.level ?? 'beginner'
  const eq = equipmentOf(p)
  const n = clamp(level === 'beginner' ? 4 : 5, 3, p.availableDays.length)
  const days = spreadDays(p.availableDays, n)
  const raceWeekday = goal.eventDate ? weekdayIndex(goal.eventDate) : 5
  const out: PlanWeek[] = []
  for (let w = 1; w <= spec.weeks; w++) {
    const phase = phaseFor(goal, w, spec.weeks)
    const recovery = isRecoveryWeek(goal, w, spec.weeks)
    const progress = w / spec.weeks
    const slots: Slot[] = []
    if (phase === 'race') {
      days.filter((d) => d < raceWeekday).slice(-2).forEach((d, i) => slots.push({ day: d, sport: i ? 'run' : 'hyrox', title: i ? "Activación 20'" : 'Repaso de estaciones ligero', description: i ? 'Trote suave con 3 aceleraciones.' : '1 serie suave de cada estación para recordar la técnica. Nada de fatiga.', durationMin: i ? 20 : 30, intensityRpe: 4, blocks: i ? runBlocks(eq, [text('Trote suave', "10'")], true) : [warmup(eq), { name: 'Repaso', items: STATIONS.map((s) => item(s.id, eq, 1, stationDose(s.id, 0.25))) }] }))
      slots.push({ day: raceWeekday, sport: 'race', title: goal.eventName || 'Hyrox', description: '8 × (1 km de carrera + estación). Empieza los primeros kilómetros controlado: la carrera se decide en las últimas estaciones.', durationMin: 90, intensityRpe: 9, key: true })
      out.push(finishWeek(w, weekStart(spec.start, w), phase, false, slots, ['Semana de competición: descansa y repasa el orden de las estaciones.']))
      continue
    }
    const vol = recovery ? 0.7 : phase === 'taper' ? 0.6 : 1
    const intervalReps = clamp(Math.round(lerp(3, 8, progress)), 3, 8)
    days.forEach((d, i) => {
      const kind = ['run_easy', 'strength_lower', 'run_intervals', 'stations', 'strength_upper'][i % 5]
      if (kind === 'run_easy') {
        const m = round5(lerp(25, 50, progress) * vol)
        slots.push({ day: d, sport: 'run', title: `Rodaje suave ${fmtMin(m)}`, description: 'Ritmo cómodo. La base aeróbica es la mitad de un Hyrox.', durationMin: m, intensityRpe: 4, blocks: runBlocks(eq, [text('Rodaje suave (RPE 4)', fmtMin(Math.max(10, m - 15)))]) })
      } else if (kind === 'run_intervals') {
        const reps = recovery ? Math.max(3, intervalReps - 2) : intervalReps
        slots.push({ day: d, sport: 'run', title: `Series ${reps}×1 km`, description: `${reps} veces 1 km a ritmo objetivo de Hyrox con 90" de recuperación caminando.`, durationMin: round5(reps * 6.5 + 15), intensityRpe: 7, blocks: runBlocks(eq, [{ label: '1 km a ritmo Hyrox', sets: reps, reps: '1 km', note: '90" caminando entre series' }], true) })
      } else if (kind === 'stations') {
        // Carrera comprometida: correr cansado después de cada estación
        const rounds = phase === 'specific' ? 8 : phase === 'build2' ? 6 : 4
        const fraction = phase === 'specific' ? 1 : phase === 'build2' ? 0.6 : 0.4
        const chosen = STATIONS.slice(0, rounds).concat(STATIONS.slice(0, Math.max(0, rounds - STATIONS.length)))
        const runDist = phase === 'base' ? '400 m' : phase === 'build1' ? '600 m' : '1 km'
        const items: WorkoutItem[] = chosen.flatMap((s) => [text(`Carrera ${runDist}`, runDist), item(s.id, eq, 1, stationDose(s.id, fraction * vol))])
        const isSim = phase === 'specific' && !recovery
        slots.push({ day: d, sport: 'hyrox', title: isSim ? 'Simulacro Hyrox' : `Estaciones + carrera (${rounds} rondas)`, description: isSim ? 'Simulacro completo o casi: practica transiciones, ritmo y lo que comes antes.' : `${rounds} rondas de ${runDist} corriendo + estación. Objetivo: acostumbrarte a correr con las piernas cargadas.`, durationMin: round5(15 + rounds * (phase === 'specific' ? 10 : 7)), intensityRpe: 8, key: true, blocks: [warmup(eq, ['mov_cadera', 'rotacion_toracica']), { name: 'Parte principal', items }, cooldown(eq)] })
      } else {
        const lower = kind === 'strength_lower'
        const sets = recovery ? 2 : level === 'beginner' ? 3 : 4
        const items = lower
          ? [item(eq === 'gym' ? 'sentadilla_barra' : 'sentadilla_goblet', eq, sets, '6-8', 120, 'RIR 2'), item(eq === 'gym' ? 'rumano_barra' : 'rumano_mancuernas', eq, sets, '8', 90), item('sandbag_lunges', eq, sets, '20 pasos', 60), item('wall_ball', eq, sets, '15-20', 60), item('plancha', eq, 2, '45 s', 30)]
          : [item('press_mancuernas', eq, sets, '8-10', 90), item('remo_mancuerna', eq, sets, '10 por brazo', 60), item('press_hombro', eq, sets, '10', 60), item('farmers', eq, sets, '40 m', 60), item('burpee_salto', eq, 3, '10 m', 60)]
        slots.push({ day: d, sport: 'strength', title: lower ? 'Fuerza: tren inferior' : 'Fuerza: tren superior y agarre', description: 'Fuerza útil para las estaciones. Técnica limpia y descansos completos.', durationMin: round5(10 + strengthMinutes(items)), intensityRpe: 7, blocks: [warmup(eq), { name: 'Parte principal', items }, cooldown(eq)] })
      }
    })
    out.push(finishWeek(w, weekStart(spec.start, w), phase, recovery, slots, [recovery ? 'Semana de descarga.' : '', eq !== 'gym' ? 'Sin gimnasio, las estaciones se cambian por ejercicios equivalentes; intenta probar las máquinas reales antes de competir.' : '']))
  }
  return out
}

// ---------- triatlón: detalle de las sesiones ----------

/** Añade los pasos de cada sesión del plan del triatlón (spec §7) sin cambiar su volumen. */
export function detailTriSession(s: SessionDraft, eq: HomeEquipment): SessionDraft {
  if (s.blocks) return s
  if (s.sport === 'strength') {
    const sets = s.durationMin >= 40 ? 3 : 2
    const ids = ['sentadilla_goblet', 'step_up', 'puente_gluteo', 'rumano_mancuernas', 'remo_mancuerna', 'flexion_inclinada', 'plancha', 'gemelo']
    const main = ids.map((id) => item(id, eq, id === 'plancha' ? 2 : sets, id === 'plancha' ? '30-45 s' : id === 'gemelo' ? '15' : '8-12', 60, id === 'plancha' ? undefined : 'RIR 2-3'))
    return { ...s, blocks: [warmup(eq), { name: 'Parte principal', items: main }, { name: 'Movilidad final', items: [item('mov_cadera', eq, 1, '8 por lado'), item('estiramientos', eq, 1, "5'")] }] }
  }
  if (s.sport === 'swim' && s.distanceM) {
    const m = s.distanceM
    const warm = m >= 800 ? 200 : 100
    const drills = m >= 600 ? 4 : 2
    const tech: WorkoutItem[] = [
      { exerciseId: 'nado_patada_tabla', label: 'Patada con tabla', sets: drills, reps: '25 m', restSec: 20 },
      { exerciseId: 'nado_un_brazo', label: 'Crol a un brazo', sets: drills, reps: '25 m', restSec: 20 },
      { exerciseId: 'nado_alcance', label: 'Crol con alcance', sets: drills, reps: '25 m', restSec: 20 },
    ]
    const techM = drills * 75
    const mainM = Math.max(100, m - warm - techM - 100)
    const main: WorkoutItem[] = s.key
      ? [{ exerciseId: 'nado_respiracion', label: 'Crol continuo', reps: `${mainM} m`, note: 'Ritmo cómodo, respiración cada 3' }]
      : [{ exerciseId: 'nado_respiracion', label: 'Series de crol', sets: Math.max(2, Math.round(mainM / 100)), reps: '100 m', restSec: 30, note: 'Si 100 m es mucho, haz 2×50 m' }]
    return { ...s, blocks: [{ name: 'Calentamiento', items: [text('Crol o espalda suave', `${warm} m`)] }, { name: 'Técnica', items: tech }, { name: 'Parte principal', items: main }, { name: 'Vuelta a la calma', items: [text('Muy suave, el estilo que quieras', '100 m')] }] }
  }
  if (s.sport === 'run' || s.sport === 'walk') {
    if (s.structure?.kind === 'intervals') {
      const st = s.structure
      return { ...s, blocks: runBlocks(eq, [{ exerciseId: 'trote_caminata', label: 'Trote y caminata alternos', sets: st.reps, reps: `${st.onMin}' trote + ${st.offMin}' caminata` }]) }
    }
    if (s.sport === 'walk') return s
    return { ...s, blocks: runBlocks(eq, [text(s.title, fmtMin(Math.max(10, s.durationMin - 15)), s.description)], s.intensityRpe >= 6 || s.description.includes('aceleraciones')) }
  }
  if (s.sport === 'bike') {
    return { ...s, blocks: [{ name: 'Calentamiento', items: [text('Pedaleo suave, cadencia alta', "10'")] }, { name: 'Parte principal', items: [text(s.intensityRpe >= 6 ? 'Bloques a ritmo (RPE 6)' : 'Zona 2 (RPE 3-4), cadencia 85-95 rpm', fmtMin(Math.max(10, s.durationMin - 15)), s.description)] }, { name: 'Vuelta a la calma', items: [text('Suave', "5'")] }] }
  }
  if (s.sport === 'brick' && s.structure?.kind === 'segments') {
    const [b, r] = s.structure.segments
    return { ...s, blocks: [{ name: 'Bici', items: [text('Zona 2 con el último cuarto a ritmo de carrera', fmtMin(b.durationMin))] }, { name: 'Transición', items: [text('Cambio rápido: practica dejar la bici y salir a correr', '2-3\'')] }, { name: 'Carrera', items: [text('Suave los primeros minutos hasta soltar las piernas', fmtMin(r.durationMin))] }] }
  }
  return s
}

// ---------- entrada única ----------

export function generateForGoal(p: GoalPlanProfile): PlanWeek[] {
  const goal = goalOf(p)
  switch (goal.type) {
    case 'strength':
      return strengthPlan(p)
    case 'weight_loss':
      return weightLossPlan(p)
    case 'running':
      return runningPlan(p)
    case 'hyrox':
      return hyroxPlan(p)
    case 'triathlon': {
      const spec = planSpec(p)
      const eq = equipmentOf(p)
      const date = goal.eventDate ?? p.raceDate
      return generatePlan({
        planStart: spec.start,
        maxWeeklyHours: p.weeklyHoursAvailable,
        raceWeekday: weekdayIndex(date),
        raceName: goal.eventName || p.raceName,
        availableDays: p.availableDays,
      }).map((w) => ({ ...w, sessions: w.sessions.map((s) => detailTriSession(s, eq)) }))
    }
  }
}


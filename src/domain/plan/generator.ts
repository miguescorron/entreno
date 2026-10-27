import { addDays, PLAN_WEEKS, weekStart, type ISODate } from '../dates'
import type { Phase, SessionDraft, SessionStructure, Sport, WeekDraft } from '../types'

// Generador del plan de 51 semanas (spec §7).
// S1-S12 salen literalmente de la tabla 7.3; S13-S51 de las plantillas 7.4,
// interpolando las sesiones largas entre hitos y aplicando +10 % máximo y
// descarga cada 4ª semana.

export interface PlanOptions {
  planStart: ISODate
  /** Tope de horas semanales (disponibilidad). Por defecto 10 h. */
  maxWeeklyHours?: number
  /** Día de la carrera dentro de la semana 51 (0 = lunes … 6 = domingo). Por defecto domingo. */
  raceWeekday?: number
  raceName?: string
  /** Días disponibles (0 = lunes … 6 = domingo). Las sesiones de otros días se recolocan. */
  availableDays?: number[]
}

export const RECOVERY_WEEKS = new Set([4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44])
export const CONTROL_TEST_WEEKS = new Set([12, 24, 36, 46])
export const RACE_REHEARSAL_WEEKS = new Set([42, 45])
const RECOVERY_FACTOR = 0.7
const MAX_WEEKLY_INCREASE = 1.1

export function phaseForWeek(w: number): Phase {
  if (w <= 12) return 'base'
  if (w <= 24) return 'build1'
  if (w <= 36) return 'build2'
  if (w <= 46) return 'specific'
  if (w <= 50) return 'taper'
  return 'race'
}

const PHASE_RANGE: Record<Exclude<Phase, 'base' | 'taper' | 'race'>, [number, number]> = {
  build1: [13, 24],
  build2: [25, 36],
  specific: [37, 46],
}

// ---------- utilidades ----------

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)
const floor5 = (n: number) => Math.max(5, Math.floor(n / 5) * 5)
const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50)
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))

/** Minutos estimados para una sesión de natación de `m` metros (principiante, con pausas). */
export const swimMinutes = (m: number) => round5(8 + m * 0.035)
const RUN_PACE_MIN_KM = 7.5
const BIKE_KMH = 22

function interpAnchors(anchors: [number, number][], w: number): number {
  if (w <= anchors[0][0]) return anchors[0][1]
  for (let i = 1; i < anchors.length; i++) {
    const [w0, v0] = anchors[i - 1]
    const [w1, v1] = anchors[i]
    if (w <= w1) return lerp(v0, v1, (w - w0) / (w1 - w0))
  }
  return anchors[anchors.length - 1][1]
}

// Picos de cada bloque (tabla 7.4). Se alcanzan en la última semana de carga
// del bloque (11, 23, 35, 45): las semanas 12, 24 y 36 son de descarga con test.
const LONG_SWIM_CONTINUOUS: [number, number][] = [[11, 800], [23, 1500], [35, 1900], [45, 2100]]
const LONG_BIKE_MIN: [number, number][] = [[11, 110], [23, 150], [35, 195], [45, 235]]
const LONG_RUN_MIN: [number, number][] = [[11, 20], [23, 47], [35, 90], [45, 125]]

const STRENGTH_EXERCISES =
  'Cuerpo completo, 2-3 series de 8-12 repeticiones sin llegar al fallo: sentadilla goblet, step-up, puente de glúteo, peso muerto rumano con mancuernas, remo con mancuerna o banda, flexiones inclinadas, plancha, elevaciones de gemelo. Termina con movilidad de cadera y tobillo.'

const EASY = 'Zona 1-2 (RPE 3-4): tienes que poder hablar.'

// ---------- constructores de sesiones ----------

type Slot = Omit<SessionDraft, 'date'> & { day: number }

function swim(day: number, meters: number, opts: Partial<Slot> = {}): Slot {
  return {
    day,
    sport: 'swim',
    title: 'Natación',
    description: `${meters} m: técnica de crol + series cortas con descanso. ${EASY}`,
    durationMin: swimMinutes(meters),
    distanceM: meters,
    intensityRpe: 4,
    ...opts,
  }
}

function strength(day: number, min: number, label = 'Fuerza', opts: Partial<Slot> = {}): Slot {
  return { day, sport: 'strength', title: label, description: STRENGTH_EXERCISES, durationMin: min, intensityRpe: 5, ...opts }
}

function runIntervals(day: number, reps: number, on: number, off: number): Slot {
  const structure: SessionStructure = { kind: 'intervals', reps, onMin: on, offMin: off, warmupMin: 5, cooldownMin: 5 }
  return {
    day,
    sport: 'run',
    title: `Trote/caminata ${reps}×(${on}'T+${off}'C)`,
    description: `5' caminando rápido, ${reps} repeticiones de ${on}' trote suave + ${off}' caminata rápida, 5' caminando. Todo a RPE 3-4.`,
    durationMin: reps * (on + off) + 10,
    intensityRpe: 4,
    structure,
  }
}

function bike(day: number, min: number, opts: Partial<Slot> = {}): Slot {
  return {
    day,
    sport: 'bike',
    title: `Bici ${fmtMin(min)}`,
    description: `Zona 2, cadencia cómoda, terreno llano. ${EASY}`,
    durationMin: min,
    distanceM: Math.round((min / 60) * BIKE_KMH) * 1000,
    intensityRpe: 4,
    ...opts,
  }
}

function run(day: number, min: number, title: string, description: string, rpe = 4, opts: Partial<Slot> = {}): Slot {
  return {
    day,
    sport: 'run',
    title,
    description,
    durationMin: min,
    distanceM: Math.round((min / RUN_PACE_MIN_KM) * 10) * 100,
    intensityRpe: rpe,
    ...opts,
  }
}

export function fmtMin(min: number): string {
  if (min < 60) return `${min}'`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

// ---------- S1-S12 (tabla 7.3) ----------

interface BaseRow {
  swimM: number
  swimLabel?: string
  run: [number, number, number] | 'test'
  runSessions: 1 | 2
  bikeMin: number
  strength: [1 | 2, number]
}

const BASE_TABLE: BaseRow[] = [
  { swimM: 400, swimLabel: '300-400 m', run: [6, 1, 2], runSessions: 2, bikeMin: 40, strength: [2, 30] },
  { swimM: 400, run: [6, 2, 2], runSessions: 2, bikeMin: 45, strength: [2, 30] },
  { swimM: 500, run: [5, 3, 2], runSessions: 2, bikeMin: 50, strength: [2, 30] },
  { swimM: 400, run: [5, 2, 2], runSessions: 1, bikeMin: 40, strength: [1, 30] },
  { swimM: 600, run: [4, 5, 2], runSessions: 2, bikeMin: 60, strength: [2, 35] },
  { swimM: 700, run: [3, 8, 2], runSessions: 2, bikeMin: 70, strength: [2, 35] },
  { swimM: 800, run: [3, 10, 2], runSessions: 2, bikeMin: 80, strength: [2, 35] },
  { swimM: 600, run: [4, 5, 2], runSessions: 2, bikeMin: 60, strength: [1, 35] },
  { swimM: 900, run: [3, 12, 2], runSessions: 2, bikeMin: 90, strength: [2, 40] },
  { swimM: 1000, run: [2, 15, 2], runSessions: 2, bikeMin: 100, strength: [2, 40] },
  { swimM: 1100, run: 'test', runSessions: 2, bikeMin: 110, strength: [2, 40] },
  { swimM: 800, run: [3, 8, 2], runSessions: 2, bikeMin: 75, strength: [1, 35] },
]

// Reparto Base: L fuerza A · M natación · X carrera · J natación + fuerza B · V descanso · S bici · D carrera + movilidad
function baseWeek(w: number): Slot[] {
  const r = BASE_TABLE[w - 1]
  const slots: Slot[] = []
  const swimDesc = (label: string) =>
    `${label}: técnica de crol + series cortas con descanso. ${EASY} Si tu crol no es fluido, apúntate a clases o a un club desde ya.`

  slots.push(strength(0, r.strength[1], 'Fuerza A'))
  slots.push(swim(1, r.swimM, { description: swimDesc(r.swimLabel ?? `${r.swimM} m`) }))

  if (r.run === 'test') {
    slots.push(
      run(2, 30, 'Test: 20\' de carrera continua', "5' caminando, 20' de carrera continua a ritmo suave y constante, 5' caminando. Apunta la distancia.", 6, {
        test: 'run20',
        key: true,
      }),
    )
    slots.push({ ...runIntervals(6, 2, 10, 2), description: "2×(10'T+2'C) muy suave, recuperación del test. Después 10' de movilidad." })
  } else {
    const [reps, on, off] = r.run
    slots.push(runIntervals(2, reps, on, off))
    if (r.runSessions === 2) {
      const s = runIntervals(6, reps, on, off)
      slots.push({ ...s, description: `${s.description} Después 10' de movilidad.` })
    } else {
      slots.push({
        day: 6,
        sport: 'walk',
        title: 'Paseo + movilidad',
        description: "Paseo de 30' y 10' de movilidad de cadera y tobillo. Semana de descarga.",
        durationMin: 40,
        intensityRpe: 2,
        optional: true,
      })
    }
  }

  slots.push(swim(3, r.swimM, { description: swimDesc(r.swimLabel ?? `${r.swimM} m`) }))
  if (r.strength[0] === 2) slots.push(strength(3, r.strength[1], 'Fuerza B'))

  const isControl = CONTROL_TEST_WEEKS.has(w)
  slots.push(
    bike(5, r.bikeMin, {
      key: true,
      ...(isControl
        ? {
            title: `Bici ${fmtMin(r.bikeMin)} con test de 30'`,
            description: "Calienta 20' suave, 30' a ritmo sostenido (lo más fuerte que puedas mantener igual todo el rato), resto suave. Apunta la velocidad media.",
            test: 'bike30' as const,
            intensityRpe: 6,
          }
        : { title: `Bici larga ${fmtMin(r.bikeMin)}` }),
    }),
  )

  if (isControl) {
    const i = slots.findIndex((s) => s.sport === 'swim')
    slots[i] = {
      ...slots[i],
      title: 'Natación con test de 400 m',
      description: "Calienta 200 m suave, test de 400 m a ritmo sostenido (apunta el tiempo), suelta 200 m.",
      test: 'swim400',
      key: true,
      intensityRpe: 6,
    }
  }
  return slots
}

// ---------- S13-S46 (plantillas 7.4) ----------

function phaseProgress(w: number, phase: keyof typeof PHASE_RANGE) {
  const [a, b] = PHASE_RANGE[phase]
  return (w - a) / (b - a)
}

function longSwimSlot(day: number, w: number, extra = ''): Slot {
  const cont = round50(interpAnchors(LONG_SWIM_CONTINUOUS, w))
  const total = cont + 300
  return swim(day, total, {
    title: `Natación ${total} m`,
    description: `Calentamiento 200 m, ${cont} m continuos a ritmo cómodo, 100 m suave.${extra}`,
    key: true,
  })
}

function longBikeSlot(day: number, w: number): Slot {
  const min = round5(interpAnchors(LONG_BIKE_MIN, w))
  return bike(day, min, { title: `Bici larga ${fmtMin(min)}`, key: true })
}

function longRunSlot(day: number, w: number): Slot {
  const min = round5(interpAnchors(LONG_RUN_MIN, w))
  const km = Math.round((min / RUN_PACE_MIN_KM) * 10) / 10
  const strat = min >= 60 ? " Si lo necesitas, alterna 9' corriendo / 1' caminando: es una estrategia válida." : ''
  return run(day, min, `Carrera larga ${fmtMin(min)}`, `≈ ${String(km).replace('.', ',')} km muy suaves. ${EASY}${strat}`, 4, { key: true })
}

function build1Week(w: number): Slot[] {
  const t = phaseProgress(w, 'build1')
  const wedMin = round5(lerp(30, 45, t))
  let wedDesc = `Carrera continua suave. ${EASY}`
  let wedTitle = `Carrera ${fmtMin(wedMin)}`
  if (w >= 20) {
    wedTitle = `Carrera ${fmtMin(wedMin)} con tempo`
    wedDesc = `Calienta 10' suave, bloque de ${w >= 22 ? 15 : 10}' a tempo suave (RPE 6, frases cortas), resto suave.`
  } else if (w >= 16) {
    wedDesc = `Carrera continua suave y al final 3-4 aceleraciones de 20" (strides) con recuperación completa.`
  }
  return [
    strength(0, 40, 'Fuerza A'),
    longSwimSlot(1, w),
    run(2, wedMin, wedTitle, wedDesc, w >= 20 ? 6 : 4),
    strength(3, 30, 'Fuerza B'),
    swim(4, 800, { title: 'Natación técnica', description: 'Técnica + series cortas (por ejemplo 8×50 m con 20" de descanso).', durationMin: 35 }),
    longBikeSlot(5, w),
    longRunSlot(6, w),
  ]
}

function brickSlot(day: number, w: number, runMin: number, title?: string): Slot {
  const bikeS = longBikeSlot(day, w)
  return {
    day,
    sport: 'brick',
    title: title ?? `Brick: bici ${fmtMin(bikeS.durationMin)} + carrera ${runMin}'`,
    description: `Bici larga en zona 2 y, sin parar, ${runMin}' de carrera suave para acostumbrar las piernas.`,
    durationMin: bikeS.durationMin + runMin,
    distanceM: bikeS.distanceM,
    intensityRpe: 5,
    key: true,
    structure: {
      kind: 'segments',
      segments: [
        { sport: 'bike', durationMin: bikeS.durationMin },
        { sport: 'run', durationMin: runMin },
      ],
    },
  }
}

function build2Week(w: number): Slot[] {
  const t = phaseProgress(w, 'build2')
  const thuMin = round5(lerp(40, 50, t))
  const tempo = round5(lerp(15, 20, t))
  return [
    strength(0, 35, 'Fuerza A'),
    longSwimSlot(1, w),
    run(1, 20, 'Carrera corta (opcional)', `20' muy suaves, solo si te encuentras fresco.`, 3, { optional: true }),
    bike(2, 60, { title: "Bici 60' con bloques", description: "Calienta 15', 2×15' en zona 3 baja (RPE 6) con 5' suaves entre medias, suelta 10'.", intensityRpe: 6 }),
    strength(2, 25, 'Fuerza B'),
    run(3, thuMin, `Carrera ${fmtMin(thuMin)} con tempo`, `Calienta 10', ${tempo}' a tempo (RPE 6), resto suave.`, 6),
    swim(4, 1000, {
      title: 'Natación técnica',
      description: w >= 33 ? 'Técnica + series. Si puedes, hazla en aguas abiertas (mínimo 1 km antes de la S36).' : 'Técnica + series (por ejemplo 10×50 m).',
      durationMin: 40,
    }),
    w >= 28 ? brickSlot(5, w, round5(lerp(10, 20, (w - 28) / (35 - 28)))) : longBikeSlot(5, w),
    longRunSlot(6, w),
  ]
}

function specificWeek(w: number): Slot[] {
  const t = phaseProgress(w, 'specific')
  const wedMin = round5(lerp(60, 75, t))
  const thuMin = round5(lerp(45, 60, t))
  const brickRun = round5(lerp(20, 40, t))
  const rehearsal = RACE_REHEARSAL_WEEKS.has(w)
  return [
    strength(0, 30, 'Fuerza mantenimiento'),
    longSwimSlot(1, w, w % 2 === 1 ? ' Esta semana, a ser posible, en aguas abiertas.' : ''),
    bike(2, wedMin, {
      title: `Bici ${fmtMin(wedMin)} a ritmo 70.3`,
      description: 'Calienta 15\' y haz el bloque central a ritmo objetivo de carrera (RPE 5-6, ≈ 23-24 km/h).',
      intensityRpe: 6,
    }),
    run(3, thuMin, `Carrera ${fmtMin(thuMin)} con ritmo carrera`, `Calienta 10', bloque de ${round5(thuMin / 3)}' a ritmo objetivo del medio maratón, resto suave.`, 6),
    swim(4, 1000, { title: 'Natación técnica (o descanso)', description: 'Técnica suave. Si vas cargado, descansa.', durationMin: 40, optional: true }),
    brickSlot(
      5,
      w,
      brickRun,
      rehearsal ? `Ensayo de carrera: bici + ${brickRun}' carrera` : undefined,
    ),
    longRunSlot(6, w),
  ].map((s) =>
    rehearsal && s.sport === 'brick'
      ? { ...s, description: `${s.description} Ensayo general: nutrición (60-80 g de hidratos/h), material de carrera y ritmo objetivo.` }
      : s,
  )
}

function controlTests(slots: Slot[]): Slot[] {
  return slots.map((s) => {
    if (s.sport === 'swim' && s.key)
      return { ...s, title: 'Natación con test de 400 m', description: 'Calienta 200 m, test de 400 m a ritmo sostenido (apunta el tiempo), suelta 200 m.', test: 'swim400' as const, intensityRpe: 6 }
    if (s.sport === 'bike' && s.day === 2)
      return { ...s, title: "Bici con test de 30'", description: "Calienta 15', 30' al máximo ritmo sostenible y constante (apunta velocidad media o potencia), suelta.", test: 'bike30' as const, intensityRpe: 7 }
    if (s.sport === 'run' && s.day === 3)
      return { ...s, title: "Test: 20' de carrera", description: "Calienta 10', 20' al máximo ritmo sostenible y constante (apunta la distancia), suelta 5'.", test: 'run20' as const, durationMin: 35, intensityRpe: 7, key: true }
    return s
  })
}

function controlTestsBuild1(slots: Slot[]): Slot[] {
  // En Construcción I la bici del miércoles no existe: el test de bici va en la larga y el de carrera el miércoles.
  return slots.map((s) => {
    if (s.sport === 'swim' && s.key)
      return { ...s, title: 'Natación con test de 400 m', description: 'Calienta 200 m, test de 400 m a ritmo sostenido (apunta el tiempo), suelta 200 m.', test: 'swim400' as const, intensityRpe: 6 }
    if (s.sport === 'run' && s.day === 2)
      return { ...s, title: "Test: 20' de carrera", description: "Calienta 10', 20' al máximo ritmo sostenible (apunta la distancia), suelta 5'.", test: 'run20' as const, durationMin: 35, intensityRpe: 7, key: true }
    if (s.sport === 'bike' && s.day === 5)
      return { ...s, title: `Bici ${fmtMin(s.durationMin)} con test de 30'`, description: "Calienta 20', 30' a ritmo sostenido (apunta la velocidad media), resto suave.", test: 'bike30' as const, intensityRpe: 6 }
    return s
  })
}

// ---------- S47-S51 ----------

const TAPER_FACTOR: Record<number, number> = { 47: 0.8, 48: 0.7, 49: 0.55, 50: 0.45 }

function taperWeek(w: number, peak: Slot[]): Slot[] {
  const f = TAPER_FACTOR[w]
  return peak
    .filter((s) => !s.optional && !(w >= 49 && s.sport === 'strength'))
    .map((s) => scaleSlot({ ...s, test: undefined, key: s.sport === 'brick' || s.key }, f))
    .map((s) =>
      s.sport === 'strength'
        ? s
        : { ...s, description: `${s.description} Afinado: menos volumen, mantén 2-3 toques cortos a ritmo de carrera.` },
    )
}

function raceWeek(raceDay: number, raceName: string): Slot[] {
  const slots: Slot[] = [
    swim(1, 800, { title: 'Natación de activación', description: "20' suaves con 4×50 m a ritmo de carrera.", durationMin: 20 }),
    { ...bike(2, 30), title: "Bici 30' de activación", description: "Suave con 3 toques de 1' a ritmo de carrera. Revisa la bici." },
    run(3, 15, "Carrera 15' de activación", "Suave con 3 aceleraciones cortas. Desde hoy, carga de hidratos (6-8 g/kg/día las 48 h previas).", 4),
    {
      day: 5,
      sport: 'other',
      title: 'Reconocimiento y logística',
      description: 'Recoge dorsal, reconoce el circuito, deja la bici en boxes. Cena conocida y baja en fibra.',
      durationMin: 15,
      intensityRpe: 2,
    },
  ]
  slots.push({
    day: raceDay,
    sport: 'race',
    title: raceName,
    description:
      'Natación 55-60\' · bici 3 h 40-4 h 00 (RPE 5-6) · carrera 2 h 20-2 h 30 con caminatas si hace falta. 60-80 g de hidratos/h, 500-750 ml/h. Objetivo: terminar sano.',
    durationMin: 465,
    distanceM: 113_000,
    intensityRpe: 7,
    key: true,
  })
  return slots.filter((s) => s.day < raceDay || s.sport === 'race')
}

// ---------- carga y topes ----------

export function sessionLoadMin(s: Pick<SessionDraft, 'durationMin' | 'optional' | 'sport'>): number {
  return s.optional || s.sport === 'race' ? 0 : s.durationMin
}

export function weekLoadMin(sessions: Pick<SessionDraft, 'durationMin' | 'optional' | 'sport'>[]): number {
  return sessions.reduce((a, s) => a + sessionLoadMin(s), 0)
}

function scaleSlot<T extends Slot>(s: T, f: number): T {
  if (f >= 1) return s
  const durationMin = floor5(s.durationMin * f)
  const ratio = durationMin / s.durationMin
  const structure =
    s.structure?.kind === 'segments'
      ? { ...s.structure, segments: s.structure.segments.map((g) => ({ ...g, durationMin: floor5(g.durationMin * f) })) }
      : s.structure
  return {
    ...s,
    durationMin: structure?.kind === 'segments' ? structure.segments.reduce((a, g) => a + g.durationMin, 0) : durationMin,
    distanceM: s.distanceM ? Math.round((s.distanceM * ratio) / 50) * 50 : undefined,
    structure,
  }
}

/** Escala por igual las sesiones (salvo fuerza y opcionales) para que la carga no pase de `capMin`. */
function capWeek(slots: Slot[], capMin: number): Slot[] {
  const flexible = (s: Slot) => s.sport !== 'strength' && !s.optional
  let out = slots
  // floor5 garantiza no pasarse salvo por el mínimo de 5': se ajusta en bucle
  for (let i = 0; i < 10 && weekLoadMin(out) > capMin; i++) {
    const movable = weekLoadMin(out.filter(flexible))
    const f = Math.min(0.97, (capMin - (weekLoadMin(out) - movable)) / movable)
    out = out.map((s) => (flexible(s) ? scaleSlot(s, f) : s))
  }
  return out
}

/** Horas máximas por fase (tabla 7.2). */
export const PHASE_MAX_HOURS: Partial<Record<Phase, number>> = { build1: 6.5, build2: 8.5, specific: 10.5 }

// ---------- días disponibles ----------

/**
 * Recoloca las sesiones que caen en días no disponibles en el día disponible
 * menos cargado y más cercano. Evita dejar dos carreras en días seguidos
 * durante las primeras 20 semanas.
 */
export function fitToDays<T extends { day: number; sport: Sport }>(slots: T[], availableDays: number[], week: number): T[] {
  const avail = new Set(availableDays)
  if (avail.size === 0 || avail.size === 7) return slots
  const placed = slots.filter((s) => avail.has(s.day) || s.sport === 'race')
  const toMove = slots.filter((s) => !avail.has(s.day) && s.sport !== 'race')
  const isRun = (s: { sport: Sport }) => s.sport === 'run' || s.sport === 'brick'

  for (const s of toMove) {
    let best = -1
    let bestScore = Infinity
    for (const d of avail) {
      const sameDay = placed.filter((p) => p.day === d)
      let score = sameDay.length * 10 + Math.abs(d - s.day)
      if (isRun(s)) {
        if (sameDay.some(isRun)) score += 200
        if (week <= 20 && placed.some((p) => isRun(p) && Math.abs(p.day - d) === 1)) score += 100
      }
      if (score < bestScore) {
        bestScore = score
        best = d
      }
    }
    placed.push({ ...s, day: best })
  }
  return placed
}

// ---------- generador principal ----------

export function generatePlan({ planStart, maxWeeklyHours = 10, raceWeekday = 6, raceName = 'ICAN Gandía 70.3', availableDays }: PlanOptions): WeekDraft[] {
  const maxMin = maxWeeklyHours * 60
  const weeks: { w: number; slots: Slot[] }[] = []
  let lastLoading = 0
  let peakSlots: Slot[] = []

  for (let w = 1; w <= PLAN_WEEKS; w++) {
    const phase = phaseForWeek(w)
    const recovery = RECOVERY_WEEKS.has(w)
    let slots: Slot[]

    if (phase === 'base') {
      slots = baseWeek(w)
    } else if (phase === 'taper') {
      slots = taperWeek(w, peakSlots)
    } else if (phase === 'race') {
      slots = raceWeek(raceWeekday, raceName)
    } else {
      slots = phase === 'build1' ? build1Week(w) : phase === 'build2' ? build2Week(w) : specificWeek(w)
      if (recovery) {
        slots = slots.filter((s) => !s.optional)
        slots = capWeek(slots, Math.min(lastLoading * RECOVERY_FACTOR, weekLoadMin(slots) * RECOVERY_FACTOR))
      } else {
        slots = capWeek(slots, Math.min(lastLoading * MAX_WEEKLY_INCREASE, maxMin, (PHASE_MAX_HOURS[phase] ?? 99) * 60))
      }
      if (w === 46) peakSlots = slots
      if (CONTROL_TEST_WEEKS.has(w)) slots = phase === 'build1' ? controlTestsBuild1(slots) : controlTests(slots)
    }

    if (availableDays) slots = fitToDays(slots, availableDays, w)
    if (!recovery && w <= 46) lastLoading = weekLoadMin(slots)
    weeks.push({ w, slots })
  }

  return weeks.map(({ w, slots }) => {
    const start = weekStart(planStart, w)
    const sessions: SessionDraft[] = slots
      .sort((a, b) => a.day - b.day)
      .map(({ day, ...s }) => ({ ...s, date: addDays(start, day) }))
    const recovery = RECOVERY_WEEKS.has(w)
    return {
      weekNumber: w,
      startDate: start,
      phase: phaseForWeek(w),
      isRecovery: recovery,
      targetHours: Math.round((weekLoadMin(sessions) / 60) * 10) / 10,
      notes: weekNote(w, recovery),
      sessions,
    }
  })
}

function weekNote(w: number, recovery: boolean): string {
  const notes: string[] = []
  if (recovery) notes.push('Semana de descarga: −30 % de volumen. Recupera de verdad.')
  if (CONTROL_TEST_WEEKS.has(w)) notes.push('Semana de pruebas de control.')
  if (RACE_REHEARSAL_WEEKS.has(w)) notes.push('Ensayo de carrera el sábado.')
  if (w >= 34 && w <= 49) notes.push('Calor: entrena a primera hora (6:30-8:30) o al final de la tarde. Más agua y sodio.')
  if (w === 51) notes.push('Semana de carrera: descanso, logística y carga de hidratos las 48 h previas.')
  return notes.join(' ')
}

export const SPORT_ORDER: Sport[] = ['swim', 'bike', 'run', 'brick', 'strength', 'walk', 'race', 'other']

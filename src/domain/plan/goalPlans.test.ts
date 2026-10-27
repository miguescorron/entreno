import { describe, expect, it } from 'vitest'
import { addDays, weekdayIndex } from '../dates'
import { canDo, exerciseById } from '../exercises'
import { planSpec, type Goal } from '../goals'
import { generateForGoal, spreadDays, type GoalPlanProfile } from './goalPlans'
import { weekLoadMin } from './generator'

const base = (goal: Goal | undefined, over: Partial<GoalPlanProfile> = {}): GoalPlanProfile => ({
  goal,
  raceDate: '2027-10-10',
  raceName: 'ICAN Gandía 70.3',
  createdAt: '2026-10-27T10:00:00Z',
  availableDays: [0, 1, 2, 3, 4, 5, 6],
  weeklyHoursAvailable: 8,
  level: 'beginner',
  equipment: 'dumbbells',
  sessionMinutes: 45,
  ...over,
})

const allItems = (weeks: ReturnType<typeof generateForGoal>) => weeks.flatMap((w) => w.sessions.flatMap((s) => (s.blocks ?? []).flatMap((b) => b.items)))

describe('reparto de días', () => {
  it('separa las sesiones lo más posible', () => {
    const three = spreadDays([0, 1, 2, 3, 4, 5, 6], 3)
    expect(three).toHaveLength(3)
    for (let i = 1; i < three.length; i++) expect(three[i] - three[i - 1]).toBeGreaterThanOrEqual(2)
    expect(spreadDays([0, 2, 4], 5)).toEqual([0, 2, 4])
    expect(spreadDays([1, 2, 3, 5], 2)).toEqual([1, 5])
  })
})

describe('fuerza y tono', () => {
  const goal: Goal = { type: 'strength', focus: 'tone', startDate: '2026-10-26' }

  it('12 semanas, 3 sesiones de fuerza por semana para principiante, en sus días', () => {
    const p = base(goal, { availableDays: [0, 2, 4, 5] })
    const weeks = generateForGoal(p)
    expect(weeks).toHaveLength(12)
    for (const w of weeks) {
      const strength = w.sessions.filter((s) => s.sport === 'strength')
      expect(strength).toHaveLength(3)
      for (const s of w.sessions) expect([0, 2, 4, 5]).toContain(weekdayIndex(s.date))
    }
  })

  it('cada sesión tiene calentamiento, parte principal y vuelta a la calma, con ejercicios reales', () => {
    const weeks = generateForGoal(base(goal))
    const s = weeks[0].sessions.find((x) => x.sport === 'strength')!
    expect(s.blocks![0].name).toBe('Calentamiento')
    expect(s.blocks![1].name).toBe('Parte principal')
    expect(s.blocks!.at(-1)!.name).toBe('Vuelta a la calma')
    for (const i of allItems(weeks)) if (i.exerciseId) expect(exerciseById(i.exerciseId), i.exerciseId).toBeDefined()
  })

  it('sin material: ningún ejercicio necesita mancuernas ni gimnasio', () => {
    const weeks = generateForGoal(base(goal, { equipment: 'none' }))
    for (const i of allItems(weeks)) if (i.exerciseId) expect(canDo(exerciseById(i.exerciseId)!, 'none'), i.exerciseId).toBe(true)
  })

  it('en gimnasio usa máquinas y barra cuando ya hay base', () => {
    const ids = new Set(allItems(generateForGoal(base(goal, { equipment: 'gym', level: 'advanced' }))).map((i) => i.exerciseId))
    expect([...ids].some((id) => id === 'sentadilla_barra' || id === 'press_banca' || id === 'jalon')).toBe(true)
  })

  it('descarga cada 4ª semana con menos series', () => {
    const weeks = generateForGoal(base(goal, { level: 'intermediate' }))
    const sets = (w: number) => weeks[w - 1].sessions.find((s) => s.sport === 'strength')!.blocks![1].items[0].sets!
    expect(weeks[3].isRecovery).toBe(true)
    expect(sets(4)).toBeLessThan(sets(3))
    expect(sets(3)).toBeGreaterThanOrEqual(sets(1))
  })

  it('la sesión se ajusta al tiempo elegido (±10 min), también para principiantes', () => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      for (const minutes of [30, 45, 60]) {
        const weeks = generateForGoal(base(goal, { sessionMinutes: minutes, level }))
        for (const w of weeks.filter((x) => !x.isRecovery)) {
          for (const s of w.sessions.filter((x) => x.sport === 'strength')) {
            expect(s.durationMin, `${level} ${minutes}`).toBeLessThanOrEqual(minutes + 10)
            expect(s.durationMin, `${level} ${minutes}`).toBeGreaterThanOrEqual(minutes - 10)
          }
        }
      }
    }
  })

  it('rota variantes al cambiar de bloque', () => {
    const weeks = generateForGoal(base(goal, { level: 'intermediate' }))
    const first = (w: number) => weeks[w - 1].sessions.find((s) => s.sport === 'strength')!.blocks![1].items.map((i) => i.exerciseId).join()
    expect(first(5)).not.toBe(first(1))
  })

  it('reps según el enfoque', () => {
    const reps = (focus: Goal['focus']) => generateForGoal(base({ ...goal, focus }, { level: 'intermediate' }))[0].sessions.find((s) => s.sport === 'strength')!.blocks![1].items[0].reps
    expect(reps('tone')).toBe('12-15')
    expect(reps('muscle')).toBe('8-12')
    expect(reps('strength')).toBe('5-8')
  })
})

describe('perder peso', () => {
  it('combina fuerza y cardio, y el cardio progresa', () => {
    const weeks = generateForGoal(base({ type: 'weight_loss', startDate: '2026-10-26' }, { availableDays: [0, 1, 2, 3, 4] }))
    const w1 = weeks[0].sessions
    expect(w1.filter((s) => s.sport === 'strength').length).toBe(3)
    expect(w1.filter((s) => s.sport === 'cardio').length).toBe(2)
    const cardioMin = (w: number) => Math.max(...weeks[w - 1].sessions.filter((s) => s.sport === 'cardio').map((s) => s.durationMin))
    expect(cardioMin(6)).toBeGreaterThan(cardioMin(1))
  })
})

describe('carrera a pie', () => {
  const eventDate = addDays('2026-10-25', 7 * 16) // domingo a 16 semanas
  const goal: Goal = { type: 'running', distance: 'half', eventDate, eventName: 'Media de prueba', startDate: '2026-10-26' }

  it('termina con la carrera el día indicado', () => {
    const weeks = generateForGoal(base(goal))
    expect(weeks).toHaveLength(planSpec(base(goal)).weeks)
    const race = weeks.at(-1)!.sessions.find((s) => s.sport === 'race')!
    expect(race.date).toBe(eventDate)
    expect(race.title).toBe('Media de prueba')
  })

  it('la tirada larga sube como mucho un 10 % y se afina al final', () => {
    const weeks = generateForGoal(base(goal, { level: 'intermediate' }))
    const long = weeks.map((w) => Math.max(0, ...w.sessions.filter((s) => s.key && s.sport === 'run').map((s) => s.durationMin)))
    let last = long[0]
    weeks.forEach((w, i) => {
      if (w.isRecovery || w.phase === 'taper' || w.phase === 'race' || i === 0) return
      expect(long[i], `S${i + 1}`).toBeLessThanOrEqual(Math.ceil(last * 1.1 / 5) * 5)
      last = long[i]
    })
    const peak = Math.max(...long)
    const taperWeek = weeks.findIndex((w) => w.phase === 'taper')
    expect(long[taperWeek]).toBeLessThan(peak)
  })

  it('los principiantes empiezan con trote y caminata', () => {
    const s = generateForGoal(base(goal))[0].sessions.find((x) => x.sport === 'run')!
    expect(s.title).toMatch(/Trote\/caminata/)
  })
})

describe('Hyrox', () => {
  const goal: Goal = { type: 'hyrox', division: 'open', eventDate: addDays('2026-10-31', 7 * 12), startDate: '2026-10-26' }

  it('incluye estaciones con carrera, simulacro y la competición', () => {
    const weeks = generateForGoal(base(goal, { equipment: 'gym', level: 'intermediate' }))
    expect(weeks.some((w) => w.sessions.some((s) => s.sport === 'hyrox'))).toBe(true)
    expect(weeks.some((w) => w.sessions.some((s) => s.title === 'Simulacro Hyrox'))).toBe(true)
    expect(weeks.at(-1)!.sessions.some((s) => s.sport === 'race')).toBe(true)
  })

  it('sin gimnasio sustituye las máquinas', () => {
    const weeks = generateForGoal(base(goal, { equipment: 'none' }))
    for (const i of allItems(weeks)) if (i.exerciseId) expect(canDo(exerciseById(i.exerciseId)!, 'none'), i.exerciseId).toBe(true)
  })
})

describe('triatlón (perfiles antiguos)', () => {
  it('sin objetivo guardado sigue siendo el 70.3 de 51 semanas, ahora con detalle', () => {
    const weeks = generateForGoal(base(undefined))
    expect(weeks).toHaveLength(51)
    const w1 = weeks[0].sessions
    expect(w1.find((s) => s.sport === 'strength')!.blocks!.length).toBeGreaterThan(1)
    expect(w1.find((s) => s.sport === 'swim')!.blocks!.map((b) => b.name)).toContain('Técnica')
    expect(weekLoadMin(w1)).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from 'vitest'
import { addDays, planStartFromRace, weekdayIndex, weekNumberFor } from '../dates'
import { generatePlan, PHASE_MAX_HOURS, RECOVERY_WEEKS, weekLoadMin } from './generator'

const start = planStartFromRace('2027-10-10')
const plan = generatePlan({ planStart: start })

describe('fechas del plan', () => {
  it('S1 empieza el lunes 19/10/2026 con carrera el 10/10/2027', () => {
    expect(start).toBe('2026-10-19')
    expect(plan[0].startDate).toBe('2026-10-19')
    expect(plan[50].startDate).toBe('2027-10-04')
  })

  it('tiene 51 semanas y cada sesión cae dentro de su semana', () => {
    expect(plan).toHaveLength(51)
    for (const w of plan) {
      expect(weekdayIndex(w.startDate)).toBe(0)
      for (const s of w.sessions) expect(weekNumberFor(start, s.date)).toBe(w.weekNumber)
    }
  })

  it('la carrera cae el día de la carrera', () => {
    const race = plan[50].sessions.find((s) => s.sport === 'race')
    expect(race?.date).toBe('2027-10-10')
    expect(plan[50].sessions.every((s) => s.date <= '2027-10-10')).toBe(true)
  })

  it('respeta un día de carrera distinto de domingo', () => {
    const p = generatePlan({ planStart: planStartFromRace('2027-10-09'), raceWeekday: 5 })
    expect(p[50].sessions.find((s) => s.sport === 'race')?.date).toBe('2027-10-09')
  })
})

describe('semanas 1-12 (tabla 7.3)', () => {
  const count = (w: number, sport: string) => plan[w - 1].sessions.filter((s) => s.sport === sport && !s.optional).length

  it('semana normal: 2 natación, 2 carrera, 1 bici, 2 fuerza', () => {
    expect([count(1, 'swim'), count(1, 'run'), count(1, 'bike'), count(1, 'strength')]).toEqual([2, 2, 1, 2])
  })

  it('S4 descarga: 1 carrera y 1 fuerza', () => {
    expect(count(4, 'run')).toBe(1)
    expect(count(4, 'strength')).toBe(1)
  })

  it('S1 empieza con 6×(1\'T+2\'C) y bici de 40\'', () => {
    const run = plan[0].sessions.find((s) => s.sport === 'run')!
    expect(run.structure).toMatchObject({ kind: 'intervals', reps: 6, onMin: 1, offMin: 2 })
    expect(plan[0].sessions.find((s) => s.sport === 'bike')!.durationMin).toBe(40)
  })

  it('S11 tiene el test de 20\' de carrera', () => {
    expect(plan[10].sessions.some((s) => s.test === 'run20')).toBe(true)
  })

  it('S12 tiene tests de natación y bici', () => {
    const tests = plan[11].sessions.map((s) => s.test).filter(Boolean)
    expect(tests).toEqual(expect.arrayContaining(['swim400', 'bike30']))
  })
})

describe('progresión (principios 7.1)', () => {
  it('nunca sube más de un 10 % respecto a la última semana de carga (S13-S46)', () => {
    let last = weekLoadMin(plan[10].sessions) // S11
    for (let w = 13; w <= 46; w++) {
      const load = weekLoadMin(plan[w - 1].sessions)
      if (RECOVERY_WEEKS.has(w)) continue
      expect(load, `S${w}`).toBeLessThanOrEqual(Math.ceil(last * 1.1))
      last = load
    }
  })

  it('las semanas de descarga bajan ≥ 25 % respecto a la anterior', () => {
    for (const w of RECOVERY_WEEKS) {
      if (w < 13) continue
      expect(weekLoadMin(plan[w - 1].sessions), `S${w}`).toBeLessThanOrEqual(weekLoadMin(plan[w - 2].sessions) * 0.75)
    }
  })

  it('no pasa del tope de horas disponible', () => {
    const p = generatePlan({ planStart: start, maxWeeklyHours: 8 })
    for (const w of p) expect(weekLoadMin(w.sessions), `S${w.weekNumber}`).toBeLessThanOrEqual(8 * 60)
  })

  it('respeta las horas máximas de cada fase (tabla 7.2)', () => {
    for (const w of plan) {
      const max = PHASE_MAX_HOURS[w.phase]
      if (max) expect(weekLoadMin(w.sessions), `S${w.weekNumber}`).toBeLessThanOrEqual(max * 60)
    }
  })

  it('no hay dos días seguidos de carrera en las primeras 20 semanas', () => {
    for (const w of plan.slice(0, 20)) {
      const runDays = w.sessions.filter((s) => s.sport === 'run' && !s.optional).map((s) => s.date)
      for (const d of runDays) expect(runDays, `S${w.weekNumber}`).not.toContain(addDays(d, 1))
    }
  })

  it('fuerza 2 veces por semana hasta la fase Específica (salvo descargas)', () => {
    for (const w of plan.slice(0, 36)) {
      if (w.isRecovery) continue
      expect(w.sessions.filter((s) => s.sport === 'strength').length, `S${w.weekNumber}`).toBe(2)
    }
  })

  it('el afinado reduce el volumen semana a semana', () => {
    const loads = [46, 47, 48, 49, 50].map((w) => weekLoadMin(plan[w - 1].sessions))
    for (let i = 1; i < loads.length; i++) expect(loads[i]).toBeLessThan(loads[i - 1])
  })

  it('las sesiones largas se acercan a los picos de los hitos', () => {
    const longBike = (w: number) => Math.max(...plan[w - 1].sessions.filter((s) => s.sport === 'bike' || s.sport === 'brick').map((s) => s.durationMin))
    expect(longBike(23)).toBeGreaterThanOrEqual(130)
    expect(longBike(45)).toBeGreaterThanOrEqual(200)
  })

  it('hay bricks desde la S28 y ensayos de carrera en S42 y S45', () => {
    expect(plan[26].sessions.some((s) => s.sport === 'brick')).toBe(false)
    expect(plan[27].sessions.some((s) => s.sport === 'brick')).toBe(true)
    expect(plan[41].sessions.some((s) => s.title.startsWith('Ensayo'))).toBe(true)
    expect(plan[44].sessions.some((s) => s.title.startsWith('Ensayo'))).toBe(true)
  })
})

describe('días disponibles', () => {
  it('solo pone sesiones en los días disponibles y sin carreras seguidas en S1-S20', () => {
    const days = [1, 3, 5, 6] // M, J, S, D
    const p = generatePlan({ planStart: start, availableDays: days })
    for (const w of p.slice(0, 50)) {
      for (const s of w.sessions) expect(days, `S${w.weekNumber} ${s.title}`).toContain(weekdayIndex(s.date))
    }
    for (const w of p.slice(0, 20)) {
      const runDays = w.sessions.filter((s) => s.sport === 'run' && !s.optional).map((s) => s.date)
      for (const d of runDays) expect(runDays, `S${w.weekNumber}`).not.toContain(addDays(d, 1))
    }
  })

  it('no pierde sesiones al recolocar', () => {
    const p = generatePlan({ planStart: start, availableDays: [0, 2, 4, 6] })
    expect(p.map((w) => w.sessions.length)).toEqual(plan.map((w) => w.sessions.length))
  })
})

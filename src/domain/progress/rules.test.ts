import { describe, expect, it } from 'vitest'
import { EMPTY_MARKS, evaluateMilestone, MILESTONE_RULES, projectWeight, trafficLight, type MilestoneInput } from './rules'

const H3 = MILESTONE_RULES.find((r) => r.key === 'H3')!
const base: MilestoneInput = { currentWeek: 6, marks: EMPTY_MARKS, adherenceFirst4: null, medicalCheckDone: false }

describe('hitos (spec §6)', () => {
  it('adelantado si cumple todo al menos 1 semana antes', () => {
    const e = evaluateMilestone(H3, { ...base, currentWeek: 10, marks: { ...EMPTY_MARKS, runContinuousMin: 20, bikeLongMin: 110, swimContinuousM: 800 } })
    expect(e.status).toBe('ahead')
  })

  it('cumplido en la semana objetivo', () => {
    const e = evaluateMilestone(H3, { ...base, currentWeek: 12, marks: { ...EMPTY_MARKS, runContinuousMin: 20, bikeLongMin: 110, swimContinuousM: 800 } })
    expect(e.status).toBe('done')
  })

  it('retrasado con < 80 % a falta de 2 semanas, con la razón calculada', () => {
    const e = evaluateMilestone(H3, { ...base, currentWeek: 10, marks: { ...EMPTY_MARKS, runContinuousMin: 20, bikeLongMin: 80, swimContinuousM: 500 } })
    expect(e.status).toBe('behind')
    expect(e.reason).toContain('llevas 80 min')
  })

  it('en curso si aún queda margen', () => {
    expect(evaluateMilestone(H3, { ...base, currentWeek: 6 }).status).toBe('in_progress')
    expect(evaluateMilestone(MILESTONE_RULES.find((r) => r.key === 'H6')!, base).status).toBe('future')
  })

  it('H5: 3 de 4 criterios (75 %) a una semana es retraso; 4 de 4 es adelanto', () => {
    const H5 = MILESTONE_RULES.find((r) => r.key === 'H5')!
    const marks = { ...EMPTY_MARKS, runLongKm: 12, bikeLongMin: 200, swimContinuousM: 1900 }
    expect(evaluateMilestone(H5, { ...base, currentWeek: 35, marks }).status).toBe('behind')
    expect(evaluateMilestone(H5, { ...base, currentWeek: 35, marks: { ...marks, openWaterM: 1000 } }).status).toBe('ahead')
  })

  it('H1 usa la adherencia de las 4 primeras semanas', () => {
    const H1 = MILESTONE_RULES.find((r) => r.key === 'H1')!
    expect(evaluateMilestone(H1, { ...base, currentWeek: 4, adherenceFirst4: 90, marks: { ...EMPTY_MARKS, swimSessionM: 400 } }).status).toBe('done')
    expect(evaluateMilestone(H1, { ...base, currentWeek: 4, adherenceFirst4: 70, marks: { ...EMPTY_MARKS, swimSessionM: 400 } }).status).toBe('behind')
  })
})

describe('semáforo semanal (spec §8.5)', () => {
  const s = { required: 10, done: 9, avgRpe: 4.5, plannedRpe: 4, avgEnergy: 3.5, persistentPain: false, alarm: false }
  it('verde con buena adherencia y sin fatiga', () => expect(trafficLight(s).light).toBe('green'))
  it('amarillo con 60-79 % o fatiga alta', () => {
    expect(trafficLight({ ...s, done: 7 }).light).toBe('yellow')
    expect(trafficLight({ ...s, avgEnergy: 2 }).light).toBe('yellow')
    expect(trafficLight({ ...s, avgRpe: 6 }).light).toBe('yellow')
  })
  it('rojo con < 60 %, dolor persistente o alarma', () => {
    expect(trafficLight({ ...s, done: 5 }).light).toBe('red')
    expect(trafficLight({ ...s, persistentPain: true }).light).toBe('red')
    expect(trafficLight({ ...s, alarm: true }).light).toBe('red')
  })
  it('sin sesiones no hay semáforo', () => expect(trafficLight({ ...s, required: 0, done: 0 }).light).toBe('none'))
})

describe('proyección de peso', () => {
  it('a este ritmo llegas a la semana X', () => {
    const p = projectWeight(86, 5, -0.5, 75)
    expect(p.goalWeek).toBe(27)
    expect(p.weightAt(12)).toBe(82.5)
  })
  it('sin bajada no hay semana objetivo', () => {
    expect(projectWeight(86, 5, 0.1, 75).goalWeek).toBeNull()
    expect(projectWeight(74, 5, 0, 75).goalWeek).toBe(5)
  })
})

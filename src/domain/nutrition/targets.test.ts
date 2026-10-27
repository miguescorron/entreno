import { describe, expect, it } from 'vitest'
import { bmr, computeTargets, fuelingAdvice, sessionKcal, weeklyAdjustment, weeklySlope, type TargetInput } from './targets'

const base: TargetInput = { sex: 'male', age: 41, heightCm: 170, weightKg: 88, goalWeightKg: 75, phase: 'base', training: [] }

describe('metabolismo basal', () => {
  it('Mifflin-St Jeor hombre y mujer', () => {
    expect(bmr('male', 88, 170, 41)) .toBe(Math.round(880 + 1062.5 - 205 + 5))
    expect(bmr('female', 60, 165, 30)).toBe(Math.round(600 + 1031.25 - 150 - 161))
  })
})

describe('gasto del entreno', () => {
  it('MET × kg × horas', () => {
    expect(sessionKcal({ sport: 'bike', durationMin: 60 }, 88)).toBe(Math.round(6.5 * 88))
  })
  it('trote/caminata mezcla los MET', () => {
    const k = sessionKcal({ sport: 'run', durationMin: 28, structure: { kind: 'intervals', reps: 6, onMin: 1, offMin: 2, warmupMin: 5, cooldownMin: 5 } }, 88)
    expect(k).toBeGreaterThan(sessionKcal({ sport: 'walk', durationMin: 28 }, 88))
    expect(k).toBeLessThan(sessionKcal({ sport: 'run', durationMin: 28 }, 88))
  })
  it('prefiere las kcal reales del reloj', () => {
    expect(sessionKcal({ sport: 'run', durationMin: 30, kcal: 321 }, 88)).toBe(321)
  })
})

describe('objetivos diarios', () => {
  it('descanso en Base: TDEE − 450, proteína 1,8 g/kg', () => {
    const t = computeTargets(base)
    expect(t.dayType).toBe('rest')
    expect(t.kcal).toBe(t.tdee - 450)
    expect(t.proteinG).toBe(Math.round(1.8 * 88))
  })

  it('las macros suman las kcal (±10)', () => {
    const t = computeTargets({ ...base, training: [{ sport: 'swim', durationMin: 45 }] })
    expect(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.kcal)).toBeLessThanOrEqual(10)
  })

  it('grasa al menos el 25 % de las kcal y ≥ 0,8 g/kg', () => {
    const t = computeTargets(base)
    expect(t.fatG * 9).toBeGreaterThanOrEqual(t.kcal * 0.25 - 9)
    expect(t.fatG).toBeGreaterThanOrEqual(0.8 * 88)
  })

  it('día largo (≥ 2 h) sin déficit', () => {
    const t = computeTargets({ ...base, training: [{ sport: 'bike', durationMin: 130 }] })
    expect(t.dayType).toBe('long')
    expect(t.deficit).toBe(0)
    expect(t.kcal).toBe(t.tdee)
  })

  it('nunca por debajo del basal', () => {
    const t = computeTargets({ ...base, adjustmentKcal: -2000 })
    expect(t.kcal).toBe(t.bmr)
  })

  it('Específica: mantenimiento si ya está en el peso objetivo y ≥ 5 g/kg de hidratos en día largo', () => {
    const t = computeTargets({ ...base, weightKg: 75, phase: 'specific', training: [{ sport: 'brick', durationMin: 240 }] })
    expect(t.deficit).toBe(0)
    expect(t.carbsG).toBeGreaterThanOrEqual(5 * 75)
  })

  it('Construcción II sin déficit si ya alcanzó el peso objetivo', () => {
    expect(computeTargets({ ...base, weightKg: 74, phase: 'build2' }).deficit).toBe(0)
    expect(computeTargets({ ...base, weightKg: 80, phase: 'build2' }).deficit).toBe(250)
  })

  it('agua ≥ 35 ml/kg más el entreno', () => {
    expect(computeTargets(base).waterMl).toBeGreaterThanOrEqual(35 * 88 - 50)
    expect(computeTargets({ ...base, training: [{ sport: 'run', durationMin: 60 }] }).waterMl).toBeGreaterThan(computeTargets(base).waterMl)
  })
})

describe('durante el entreno', () => {
  it('agua por debajo de 75 minutos, hidratos por encima', () => {
    expect(fuelingAdvice(60, 'base')).toBeNull()
    expect(fuelingAdvice(90, 'base')).toContain('30-60 g')
    expect(fuelingAdvice(180, 'specific')).toContain('60-90 g')
  })
})

describe('ajuste adaptativo', () => {
  const series = (startKg: number, perWeek: number, days = 21) =>
    Array.from({ length: days }, (_, d) => ({ date: new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10), kg: startKg + (perWeek / 7) * d }))

  it('calcula la pendiente semanal', () => {
    expect(weeklySlope(series(88, -0.5))!).toBeCloseTo(-0.5, 1)
  })

  it('+150 kcal si baja más de un 1 % por semana', () => {
    expect(weeklyAdjustment({ weights: series(88, -1.2), adherence: 0.9, fatigueRising: false }).deltaKcal).toBe(150)
  })

  it('−125 kcal si se estanca 2 semanas con buena adherencia', () => {
    expect(weeklyAdjustment({ weights: series(88, 0), adherence: 0.9, fatigueRising: false }).deltaKcal).toBe(-125)
    expect(weeklyAdjustment({ weights: series(88, 0), adherence: 0.6, fatigueRising: false }).deltaKcal).toBe(0)
  })

  it('con fatiga en aumento nunca recorta', () => {
    expect(weeklyAdjustment({ weights: series(88, 0), adherence: 0.9, fatigueRising: true }).deltaKcal).toBe(0)
  })

  it('sin datos no ajusta', () => {
    expect(weeklyAdjustment({ weights: [], adherence: 1, fatigueRising: false }).deltaKcal).toBe(0)
  })
})

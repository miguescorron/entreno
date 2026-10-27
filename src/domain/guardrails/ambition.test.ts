import { describe, expect, it } from 'vitest'
import { addDays } from '../dates'
import { detectAlarmSignals, evaluateAmbition, weekLoad, type GuardrailInput } from './ambition'

const today = '2026-11-12' // jueves
const empty: GuardrailInput = { today, workouts: [], weights: [], pains: [], nutrition: [] }
const keys = (i: Partial<GuardrailInput>) => evaluateAmbition({ ...empty, ...i }).map((a) => a.key)

describe('freno de ambición', () => {
  it('sin datos no hay alertas', () => {
    expect(keys({})).toEqual([])
  })

  it('carga semanal: horas × RPE medio', () => {
    expect(weekLoad([{ date: today, durationMin: 60, rpe: 4, isExtra: false }, { date: today, durationMin: 60, rpe: 6, isExtra: false }])).toBe(10)
  })

  it('avisa si la carga sube más de un 10 %', () => {
    const prev = [{ date: '2026-11-03', durationMin: 120, rpe: 4, isExtra: false }]
    expect(keys({ workouts: [...prev, { date: '2026-11-10', durationMin: 130, rpe: 4, isExtra: false }] })).not.toContain('load_jump')
    expect(keys({ workouts: [...prev, { date: '2026-11-10', durationMin: 140, rpe: 4, isExtra: false }] })).toContain('load_jump')
  })

  it('3 días seguidos con RPE ≥ 7', () => {
    const w = (d: string, rpe: number) => ({ date: d, durationMin: 40, rpe, isExtra: false })
    expect(keys({ workouts: [w('2026-11-10', 7), w('2026-11-11', 8), w('2026-11-12', 7)] })).toContain('hard_streak')
    expect(keys({ workouts: [w('2026-11-10', 7), w('2026-11-11', 6), w('2026-11-12', 7)] })).not.toContain('hard_streak')
  })

  it('2 dobles sesiones fuera de plan en la semana', () => {
    const w = (d: string, isExtra: boolean) => ({ date: d, durationMin: 30, rpe: 4, isExtra })
    const one = [w('2026-11-10', false), w('2026-11-10', true)]
    expect(keys({ workouts: one })).not.toContain('extra_doubles')
    expect(keys({ workouts: [...one, w('2026-11-11', false), w('2026-11-11', true)] })).toContain('extra_doubles')
  })

  it('peso bajando más de un 1,2 % por semana durante 2 semanas', () => {
    const series = (perWeek: number) => Array.from({ length: 21 }, (_, k) => ({ date: addDays(today, -20 + k), kg: 88 - (perWeek / 7) * k }))
    expect(keys({ weights: series(1.5) })).toContain('fast_weight_loss')
    expect(keys({ weights: series(0.6) })).not.toContain('fast_weight_loss')
  })

  it('dolor ≥ 4 en la misma zona 3 días seguidos', () => {
    const p = (d: string, zone: string, level: number) => ({ date: d, zone, level })
    expect(keys({ pains: [p('2026-11-10', 'Gemelo', 4), p('2026-11-11', 'gemelo', 5), p('2026-11-12', 'Gemelo', 4)] })).toContain('pain_streak')
    expect(keys({ pains: [p('2026-11-10', 'Gemelo', 4), p('2026-11-11', 'Rodilla', 5), p('2026-11-12', 'Gemelo', 4)] })).not.toContain('pain_streak')
    expect(keys({ pains: [p('2026-11-10', 'Gemelo', 3), p('2026-11-11', 'Gemelo', 5), p('2026-11-12', 'Gemelo', 4)] })).not.toContain('pain_streak')
  })

  it('déficit > 700 kcal o por debajo del basal (solo días cerrados)', () => {
    const n = (date: string, intakeKcal: number) => ({ date, intakeKcal, tdee: 2600, bmr: 1750 })
    expect(keys({ nutrition: [n('2026-11-11', 1850)] })).toContain('big_deficit')
    expect(keys({ nutrition: [n('2026-11-11', 1600)] })).toContain('below_bmr')
    expect(keys({ nutrition: [n('2026-11-11', 2200)] })).toEqual([])
    expect(keys({ nutrition: [n(today, 900)] })).toEqual([]) // hoy aún no ha terminado
  })
})

describe('señales de alarma', () => {
  it('detecta síntomas en lenguaje natural', () => {
    expect(detectAlarmSignals('Al acabar sentí un dolor en el pecho raro')).toEqual(['dolor en el pecho'])
    expect(detectAlarmSignals('me mareé un poco y tuve palpitaciones')).toEqual(['mareo', 'palpitaciones'])
    expect(detectAlarmSignals('Hoy genial, 40 minutos suaves')).toEqual([])
  })
})

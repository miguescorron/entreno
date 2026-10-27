import { describe, expect, it } from 'vitest'
import { bannedTerms, fitsBudget, mealBudget, violates } from './ideas'

const remaining = { kcal: 1500, protein: 120, carbs: 150, fat: 50 }

describe('presupuesto por comida', () => {
  it('reparte lo que queda entre las comidas pendientes', () => {
    // Quedan comida y cena: la comida se lleva 35/65
    expect(mealBudget(remaining, 'comida', ['comida', 'cena']).kcal).toBe(Math.round((1500 * 0.35) / 0.65))
    // Solo queda la cena: se lleva todo
    expect(mealBudget(remaining, 'cena', ['cena']).kcal).toBe(1500)
  })

  it('un snack se lleva una parte pequeña', () => {
    const b = mealBudget(remaining, 'snack', ['comida', 'cena'])
    expect(b.kcal).toBeGreaterThan(100)
    expect(b.kcal).toBeLessThan(400)
  })

  it('si ya te has pasado, presupuesto cero', () => {
    expect(mealBudget({ kcal: -200, protein: -10, carbs: 0, fat: 0 }, 'cena', ['cena']).kcal).toBe(0)
  })
})

describe('encaje en calorías', () => {
  it('±15 % con mínimo de 60 kcal', () => {
    expect(fitsBudget(560, 500)).toBe(true)
    expect(fitsBudget(600, 500)).toBe(false)
    expect(fitsBudget(240, 200)).toBe(true)
  })
})

describe('alergias y vetos', () => {
  it('extrae los alimentos a evitar del texto libre', () => {
    expect(bannedTerms('Frutos secos, marisco', 'No como cerdo ni setas')).toEqual(expect.arrayContaining(['frutos secos', 'marisco', 'cerdo', 'setas']))
    expect(bannedTerms('Ninguna', '')).toEqual([])
  })

  it('una alergia genérica veta sus alimentos concretos', () => {
    const banned = bannedTerms('Marisco', '')
    expect(violates('Gambas al ajillo exprés', banned)).toBe('gamba')
    expect(violates('Arroz con calamares', banned)).toBe('calamar')
    expect(violates('Tostada con aguacate', bannedTerms('frutos secos'))).toBeNull()
    expect(violates('Yogur con nueces', bannedTerms('frutos secos'))).toBe('nueces')
    expect(violates('Wrap de pavo', bannedTerms('gluten'))).toBe('wrap')
    expect(violates('Revuelto de setas', bannedTerms('Huevos'))).toBe('revuelto')
  })

  it('detecta un ingrediente vetado aunque cambie el acento o la mayúscula', () => {
    const banned = bannedTerms('marisco, nueces')
    expect(violates('Ensalada con NUECES y queso', banned)).toBe('nueces')
    expect(violates('Arroz con pollo y verduras', banned)).toBeNull()
  })
})

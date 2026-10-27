import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sanitizePlato } from '../ai/food'
import { macrosFor, scaleMacros } from '../domain/nutrition/foods'
import { lookupBarcode, ProductNotFoundError } from '../lib/openfoodfacts'
import { db } from './db'
import { addMeals, ensureFoodSeed, learnAiPortion, logTemplate, mealFromFood, saveTemplate, searchFoods } from './food'

beforeEach(async () => {
  await db.delete()
  await db.open()
})
afterEach(() => vi.unstubAllGlobals())

describe('base de alimentos', () => {
  it('se carga una sola vez y se busca sin acentos', async () => {
    await ensureFoodSeed()
    await ensureFoodSeed()
    const n = await db.foodItems.count()
    expect(n).toBeGreaterThan(30)
    expect((await searchFoods('platano'))[0].name).toBe('Plátano')
  })

  it('aprende la porción habitual al corregir gramos', async () => {
    await ensureFoodSeed()
    const [arroz] = await searchFoods('arroz blanco')
    await addMeals([mealFromFood(arroz, 250, { date: '2026-10-19', mealType: 'comida', source: 'manual' })])
    expect((await db.foodItems.get(arroz.id!))?.usualGrams).toBe(250)
    expect((await searchFoods(''))[0].id).toBe(arroz.id) // lo último usado sale primero
  })

  it('guarda porciones corregidas de la IA como alimento propio', async () => {
    await learnAiPortion('Salmorejo', { kcal: 110, protein: 2, carbs: 9, fat: 7 }, 300)
    const [s] = await searchFoods('salmorejo')
    expect(s).toMatchObject({ source: 'ai', usualGrams: 300, kcal100g: 110 })
  })

  it('favoritos: guardar y volver a registrar', async () => {
    const meal = { date: '2026-10-19', mealType: 'desayuno' as const, name: 'Tostada', grams: 60, kcal: 160, protein: 5, carbs: 29, fat: 2, source: 'manual' as const }
    await addMeals([meal])
    const id = await saveTemplate('Desayuno tipo', [meal])
    await logTemplate((await db.mealTemplates.get(id))!, '2026-10-20', 'desayuno')
    expect(await db.mealLogs.where('date').equals('2026-10-20').count()).toBe(1)
  })
})

describe('macros', () => {
  it('por gramos y reescalado', () => {
    expect(macrosFor({ kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, 200)).toMatchObject({ kcal: 260, protein: 5.4, carbs: 56 })
    expect(scaleMacros({ kcal: 520, protein: 34, carbs: 62, fat: 14 }, 320, 160)).toMatchObject({ kcal: 260, protein: 17, carbs: 31, fat: 7 })
  })

  it('normaliza la respuesta del modelo', () => {
    const p = sanitizePlato({ nombre: 'X', gramos_estimados: 320.4, rango_gramos: [370, 270], kcal: -5, proteina_g: 34, hidratos_g: 62, grasa_g: 14, fibra_g: 3, confianza: 1.4, supuestos: [] })
    expect(p.rango_gramos).toEqual([270, 370])
    expect(p.kcal).toBe(0)
    expect(p.confianza).toBe(1)
  })
})

describe('Open Food Facts', () => {
  it('convierte el producto y lo guarda para la próxima vez', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: { product_name: 'Yogur griego', brands: 'Marca, Otra', serving_quantity: '125', nova_group: 3, nutriments: { 'energy-kcal_100g': 97, proteins_100g: 6, carbohydrates_100g: 4, fat_100g: 6.5 } },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const item = await lookupBarcode('8410000000000')
    expect(item).toMatchObject({ name: 'Yogur griego', brand: 'Marca', kcal100g: 97, servingGrams: 125, source: 'off', novaGroup: 3 })
    await lookupBarcode('8410000000000')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('avisa si no existe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ status: 0 }) }))
    await expect(lookupBarcode('123')).rejects.toBeInstanceOf(ProductNotFoundError)
  })
})

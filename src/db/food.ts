import { BASE_FOODS, macrosFor, normalize } from '../domain/nutrition/foods'
import { db, getSetting, setSetting, type FoodItem, type MealLog, type MealTemplate } from './db'

const SEED_VERSION = 1

/** Carga la base local de alimentos la primera vez. */
export async function ensureFoodSeed() {
  if ((await getSetting('foodSeedVersion', 0)) >= SEED_VERSION) return
  await db.transaction('rw', db.foodItems, db.settings, async () => {
    const existing = await db.foodItems.toArray()
    const baseIds = existing.filter((x) => x.source === 'base').map((x) => x.id!)
    await db.foodItems.bulkDelete(baseIds)
    await db.foodItems.bulkAdd(
      BASE_FOODS.map((b) => ({
        name: b.name,
        kcal100g: b.kcal,
        protein100g: b.protein,
        carbs100g: b.carbs,
        fat100g: b.fat,
        fiber100g: b.fiber,
        servingGrams: b.serving,
        source: 'base' as const,
      })),
    )
    await setSetting('foodSeedVersion', SEED_VERSION)
  })
}

export async function searchFoods(q: string, limit = 30): Promise<FoodItem[]> {
  const all = await db.foodItems.toArray()
  const n = normalize(q)
  const hits = n ? all.filter((f) => normalize(`${f.name} ${f.brand ?? ''}`).includes(n)) : all
  // Primero lo que más usas, luego alfabético
  return hits
    .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.name.localeCompare(b.name, 'es'))
    .slice(0, limit)
}

export function defaultGrams(f: FoodItem) {
  return f.usualGrams ?? f.servingGrams ?? 100
}

export function mealFromFood(f: FoodItem, grams: number, base: Pick<MealLog, 'date' | 'mealType' | 'source'>): Omit<MealLog, 'id'> {
  const m = macrosFor({ kcal: f.kcal100g, protein: f.protein100g, carbs: f.carbs100g, fat: f.fat100g, fiber: f.fiber100g }, grams)
  return {
    ...base,
    name: f.brand ? `${f.name} (${f.brand})` : f.name,
    grams,
    ...m,
    foodItemId: f.id,
    dataSource: f.source,
  }
}

/** Guarda comidas y aprende la porción habitual de los alimentos usados. */
export async function addMeals(meals: Omit<MealLog, 'id'>[]) {
  const now = new Date().toISOString()
  return db.transaction('rw', db.mealLogs, db.foodItems, async () => {
    const ids = await db.mealLogs.bulkAdd(meals as MealLog[], { allKeys: true })
    for (const m of meals) {
      if (!m.foodItemId) continue
      const f = await db.foodItems.get(m.foodItemId)
      if (!f) continue
      const changes: Partial<FoodItem> = { lastUsedAt: now }
      // Si corriges los gramos respecto a la porción de referencia, se aprende tu porción
      if (m.grams && m.grams !== (f.usualGrams ?? f.servingGrams)) changes.usualGrams = m.grams
      await db.foodItems.update(f.id!, changes)
    }
    return ids as number[]
  })
}

/**
 * Cuando corriges los gramos de algo estimado por la IA, se guarda como
 * alimento con tu porción habitual para encontrarlo después en la búsqueda.
 */
export async function learnAiPortion(name: string, per100: { kcal: number; protein: number; carbs: number; fat: number; fiber?: number }, grams: number) {
  const n = normalize(name)
  const existing = (await db.foodItems.toArray()).find((f) => f.source === 'ai' && normalize(f.name) === n)
  const row = {
    name,
    kcal100g: Math.round(per100.kcal),
    protein100g: per100.protein,
    carbs100g: per100.carbs,
    fat100g: per100.fat,
    fiber100g: per100.fiber,
    source: 'ai' as const,
    usualGrams: grams,
    lastUsedAt: new Date().toISOString(),
  }
  if (existing) await db.foodItems.update(existing.id!, row)
  else await db.foodItems.add(row)
}

export async function saveTemplate(name: string, meals: Pick<MealLog, 'name' | 'grams' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'foodItemId' | 'dataSource' | 'mealType'>[]) {
  const t: MealTemplate = {
    name,
    mealType: meals[0]?.mealType,
    items: meals.map(({ name, grams, kcal, protein, carbs, fat, fiber, foodItemId, dataSource }) => ({ name, grams, kcal, protein, carbs, fat, fiber, foodItemId, dataSource })),
    lastUsedAt: new Date().toISOString(),
  }
  return db.mealTemplates.add(t)
}

export async function logTemplate(t: MealTemplate, date: string, mealType: MealLog['mealType']) {
  await db.mealTemplates.update(t.id!, { lastUsedAt: new Date().toISOString() })
  return addMeals(t.items.map((i) => ({ ...i, date, mealType, source: 'favorite' as const })))
}

export async function addWater(date: string, ml: number, context: 'day' | 'training' = 'day') {
  return db.hydrationLogs.add({ date, ml, context })
}

/** Tipo de comida por defecto según la hora. */
export function mealTypeForNow(d = new Date()): MealLog['mealType'] {
  const h = d.getHours()
  if (h < 11) return 'desayuno'
  if (h < 13) return 'snack'
  if (h < 17) return 'comida'
  if (h < 20) return 'snack'
  return 'cena'
}

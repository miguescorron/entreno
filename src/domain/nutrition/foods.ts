// Base local de alimentos habituales (valores por 100 g, orientativos,
// a partir de tablas de composición españolas y USDA). Sirve para el
// registro manual y para recalcular cuando cambias gramos.

export interface BaseFood {
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  /** Porción típica en gramos */
  serving: number
}

const f = (name: string, kcal: number, protein: number, carbs: number, fat: number, fiber: number, serving: number): BaseFood => ({ name, kcal, protein, carbs, fat, fiber, serving })

export const BASE_FOODS: BaseFood[] = [
  f('Pan blanco', 265, 9, 49, 3.2, 2.7, 60),
  f('Pan integral', 247, 13, 41, 3.4, 7, 60),
  f('Aceite de oliva virgen extra', 884, 0, 0, 100, 0, 10),
  f('Arroz blanco cocido', 130, 2.7, 28, 0.3, 0.4, 200),
  f('Pasta cocida', 158, 5.8, 31, 0.9, 1.8, 200),
  f('Patata cocida', 87, 1.9, 20, 0.1, 1.8, 200),
  f('Avena en copos', 389, 16.9, 66, 6.9, 10.6, 50),
  f('Lentejas cocidas', 116, 9, 20, 0.4, 7.9, 250),
  f('Garbanzos cocidos', 164, 8.9, 27, 2.6, 7.6, 250),
  f('Pechuga de pollo a la plancha', 165, 31, 0, 3.6, 0, 150),
  f('Ternera magra a la plancha', 158, 26, 0, 6, 0, 150),
  f('Pavo en lonchas', 104, 18, 2, 2.5, 0, 50),
  f('Jamón serrano', 241, 31, 0, 13, 0, 40),
  f('Huevo', 143, 12.6, 0.7, 9.5, 0, 60),
  f('Atún al natural (lata)', 116, 26, 0, 1, 0, 60),
  f('Salmón', 208, 20, 0, 13, 0, 150),
  f('Merluza', 86, 17, 0, 1.8, 0, 150),
  f('Leche semidesnatada', 46, 3.3, 4.8, 1.6, 0, 250),
  f('Yogur natural', 61, 3.5, 4.7, 3.3, 0, 125),
  f('Yogur griego 0 %', 59, 10, 3.6, 0.4, 0, 125),
  f('Queso fresco', 174, 12, 3, 13, 0, 60),
  f('Queso curado', 400, 26, 0.5, 33, 0, 30),
  f('Plátano', 89, 1.1, 23, 0.3, 2.6, 120),
  f('Manzana', 52, 0.3, 14, 0.2, 2.4, 180),
  f('Naranja', 47, 0.9, 12, 0.1, 2.4, 180),
  f('Fresas', 32, 0.7, 7.7, 0.3, 2, 150),
  f('Tomate', 18, 0.9, 3.9, 0.2, 1.2, 150),
  f('Lechuga', 15, 1.4, 2.9, 0.2, 1.3, 80),
  f('Brócoli', 34, 2.8, 7, 0.4, 2.6, 150),
  f('Aguacate', 160, 2, 9, 15, 7, 70),
  f('Almendras', 579, 21, 22, 50, 12.5, 25),
  f('Nueces', 654, 15, 14, 65, 6.7, 25),
  f('Chocolate negro 70 %', 598, 7.8, 46, 43, 11, 20),
  f('Hummus', 166, 8, 14, 9.6, 6, 50),
  f('Tortilla de patatas', 190, 6.5, 15, 12, 1.3, 150),
  f('Gazpacho', 40, 0.8, 4, 2.3, 0.8, 250),
  f('Miel', 304, 0.3, 82, 0, 0, 20),
  f('Zumo de naranja', 45, 0.7, 10, 0.2, 0.2, 200),
  f('Café con leche', 30, 1.7, 2.6, 1.4, 0, 200),
  f('Bebida isotónica', 24, 0, 6, 0, 0, 500),
  f('Gel energético', 270, 0, 68, 0, 0, 40),
  f('Cerveza sin alcohol', 21, 0.3, 4.5, 0, 0, 330),
]

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
}

export function macrosFor(per100: { kcal: number; protein: number; carbs: number; fat: number; fiber?: number }, grams: number): Macros {
  const k = grams / 100
  return {
    kcal: Math.round(per100.kcal * k),
    protein: round1(per100.protein * k),
    carbs: round1(per100.carbs * k),
    fat: round1(per100.fat * k),
    fiber: per100.fiber != null ? round1(per100.fiber * k) : undefined,
  }
}

/** Reescala unas macros estimadas para otros gramos (proporcional). */
export function scaleMacros(m: Macros, fromGrams: number, toGrams: number): Macros {
  if (!fromGrams) return m
  const k = toGrams / fromGrams
  return {
    kcal: Math.round(m.kcal * k),
    protein: round1(m.protein * k),
    carbs: round1(m.carbs * k),
    fat: round1(m.fat * k),
    fiber: m.fiber != null ? round1(m.fiber * k) : undefined,
  }
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce<Macros>(
    (a, m) => ({ kcal: a.kcal + m.kcal, protein: round1(a.protein + m.protein), carbs: round1(a.carbs + m.carbs), fat: round1(a.fat + m.fat), fiber: round1((a.fiber ?? 0) + (m.fiber ?? 0)) }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  )
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Búsqueda sin acentos ni mayúsculas. */
export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Número en formato español con hasta 1 decimal (1,5). */
export const fmt1 = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })

import { normalize, type Macros } from './foods'

// Reglas en código para las ideas de comida: cuánto toca en esta comida,
// qué ideas encajan en las calorías y cuáles chocan con alergias o vetos.

export type MealType = 'desayuno' | 'comida' | 'cena' | 'snack' | 'entreno'

/** Reparto orientativo del día entre comidas principales y picoteo. */
const SHARE: Record<MealType, number> = { desayuno: 0.25, comida: 0.35, cena: 0.3, snack: 0.1, entreno: 0.1 }

export interface Budget {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/**
 * Presupuesto para la comida elegida: lo que queda del día repartido entre las
 * comidas principales que aún no se han hecho (un snack se lleva una parte pequeña).
 */
export function mealBudget(remaining: Macros, mealType: MealType, pendingMain: MealType[]): Budget {
  const left = { kcal: Math.max(0, remaining.kcal), protein: Math.max(0, remaining.protein), carbs: Math.max(0, remaining.carbs), fat: Math.max(0, remaining.fat) }
  let share: number
  if (mealType === 'snack' || mealType === 'entreno') {
    share = Math.min(0.25, SHARE.snack / Math.max(0.1, pendingMain.reduce((a, m) => a + SHARE[m], 0) + SHARE.snack))
  } else {
    const pool = new Set<MealType>([...pendingMain, mealType])
    const total = [...pool].reduce((a, m) => a + SHARE[m], 0)
    share = SHARE[mealType] / total
  }
  const r = (n: number) => Math.round(n)
  return { kcal: r(left.kcal * share), protein: r(left.protein * share), carbs: r(left.carbs * share), fat: r(left.fat * share) }
}

/** Tolerancia: la idea vale si sus kcal quedan dentro del ±15 % (mínimo ±60 kcal). */
export function fitsBudget(kcal: number, budget: number): boolean {
  const tol = Math.max(60, budget * 0.15)
  return Math.abs(kcal - budget) <= tol
}

/**
 * Familias de alérgenos: una alergia genérica ("marisco") veta también sus
 * alimentos concretos ("gambas"). Basado en los 14 alérgenos de declaración obligatoria en la UE.
 */
const FAMILIES: Record<string, string[]> = {
  marisco: ['gamba', 'langostino', 'mejillon', 'almeja', 'berberecho', 'navaja', 'calamar', 'chipiron', 'sepia', 'pulpo', 'cangrejo', 'bogavante', 'langosta', 'cigala', 'vieira', 'ostra', 'percebe', 'buey de mar', 'surimi', 'crustaceo', 'molusco'],
  crustaceos: ['gamba', 'langostino', 'cangrejo', 'bogavante', 'langosta', 'cigala', 'percebe', 'buey de mar', 'surimi'],
  moluscos: ['mejillon', 'almeja', 'berberecho', 'navaja', 'calamar', 'chipiron', 'sepia', 'pulpo', 'vieira', 'ostra'],
  pescado: ['atun', 'salmon', 'merluza', 'bacalao', 'sardina', 'boqueron', 'anchoa', 'caballa', 'dorada', 'lubina', 'rape', 'emperador', 'pez espada', 'surimi', 'bonito'],
  'frutos secos': ['nuez', 'nueces', 'almendra', 'avellana', 'anacardo', 'pistacho', 'pinon', 'macadamia', 'pecana', 'cacahuete', 'mani', 'crema de cacahuete'],
  cacahuete: ['cacahuete', 'mani', 'crema de cacahuete'],
  gluten: ['trigo', 'pan', 'pasta', 'espagueti', 'macarron', 'cuscus', 'bulgur', 'cebada', 'centeno', 'espelta', 'harina', 'wrap', 'tortilla de trigo', 'galleta', 'pan rallado', 'rebozado', 'seitan', 'couscous'],
  celiaco: ['trigo', 'pan', 'pasta', 'cuscus', 'cebada', 'centeno', 'espelta', 'harina', 'wrap', 'tortilla de trigo', 'seitan'],
  lactosa: ['leche', 'queso', 'yogur', 'nata', 'mantequilla', 'requeson', 'kefir', 'bechamel', 'lacteo'],
  lacteos: ['leche', 'queso', 'yogur', 'nata', 'mantequilla', 'requeson', 'kefir', 'bechamel'],
  leche: ['leche', 'queso', 'yogur', 'nata', 'mantequilla', 'requeson', 'kefir', 'bechamel'],
  huevo: ['huevo', 'clara', 'yema', 'tortilla francesa', 'tortilla de patata', 'mayonesa', 'revuelto'],
  soja: ['soja', 'tofu', 'tempeh', 'edamame', 'miso', 'salsa de soja'],
  sesamo: ['sesamo', 'tahini', 'hummus'],
  mostaza: ['mostaza'],
  apio: ['apio'],
  altramuces: ['altramuz', 'altramuces'],
  sulfitos: ['vino', 'vinagre'],
  cerdo: ['cerdo', 'jamon', 'chorizo', 'lomo', 'bacon', 'beicon', 'panceta', 'salchichon', 'fuet', 'morcilla', 'sobrasada', 'chistorra'],
  carne: ['pollo', 'pavo', 'ternera', 'cerdo', 'jamon', 'cordero', 'conejo', 'chorizo', 'lomo', 'bacon', 'hamburguesa'],
  setas: ['seta', 'champinon', 'boletus', 'niscalo'],
}

/** Palabras a evitar a partir de alergias y alimentos que no come ("sin X", listas con comas). */
export function bannedTerms(...texts: string[]): string[] {
  const stop = new Set(['ninguna', 'ninguno', 'nada', 'no', 'sin', 'como', 'tomo', 'me', 'gusta', 'el', 'la', 'los', 'las', 'de', 'y', 'ni', 'alergia', 'alergico', 'alergica', 'intolerancia', 'a', 'al'])
  const words = texts
    .join(',')
    .split(/[,;\n.]+|\by\b|\bni\b/)
    .map((t) => normalize(t).replace(/^(no como|no tomo|sin|alergia a|alergico a|alergica a|intolerancia a|intolerante a)\s+/, '').trim())
    .filter((t) => t.length >= 3 && !stop.has(t))
  // Cada alergia genérica arrastra su familia; se prueba también sin la "s" final
  const expanded = words.flatMap((w) => [w, ...(FAMILIES[w] ?? FAMILIES[w.replace(/e?s$/, '')] ?? [])])
  return [...new Set(expanded)]
}

/** Devuelve el primer veto que aparece en el texto de la idea, o null. */
export function violates(text: string, banned: string[]): string | null {
  const t = normalize(text)
  return banned.find((b) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) ?? null
}

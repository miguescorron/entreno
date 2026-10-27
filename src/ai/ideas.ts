import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { Profile } from '../db/db'
import { goalOf, goalSummary } from '../domain/goals'
import type { DayType } from '../domain/nutrition/targets'
import { bannedTerms, fitsBudget, mealLabel, ULTRAPROCESSED_TERMS, violates, type Budget, type MealType } from '../domain/nutrition/ideas'
import { getClient, getMainModel } from './client'
import { structured } from './structured'

// Ideas de comida: platos caseros que existen de verdad, rápidos y ajustados a
// lo que queda del día. El modelo propone; el código comprueba calorías,
// alergias y (en modo realfooding) ultraprocesados antes de enseñarlas.

export const IdeaSchema = z.object({
  nombre: z.string().describe('Nombre normal del plato, sin juegos de palabras'),
  basada_en: z.string().describe('Receta tradicional conocida en la que se basa'),
  descripcion: z.string().describe('Una frase: por qué está bueno o por qué viene bien hoy'),
  tiempo_min: z.number(),
  ingredientes: z.array(z.object({ nombre: z.string(), cantidad: z.string(), gramos: z.number() })),
  pasos: z.array(z.string()),
  kcal: z.number(),
  proteina_g: z.number(),
  hidratos_g: z.number(),
  grasa_g: z.number(),
})

const IdeasSchema = z.object({ ideas: z.array(IdeaSchema) })

export type Idea = z.infer<typeof IdeaSchema> & { fits: boolean }

export interface IdeasRequest {
  profile: Profile
  mealType: MealType
  budget: Budget
  quick: boolean
  craving?: string
  dayType: DayType
  recentMeals: string[]
  realfooding: boolean
}

const SYSTEM = `Eres cocinero de cocina casera española y mediterránea y nutricionista deportivo. Propones comidas para una persona que entrena y cuida su alimentación en España.
Reglas:
- Solo platos que existen de verdad y que cualquiera reconocería en una casa o en un menú del día en España. Por ejemplo: lentejas estofadas, garbanzos con espinacas, merluza en salsa verde, pollo al ajillo, tortilla de calabacín, ensalada de garbanzos con atún, revuelto de espárragos, salmón a la plancha con patata asada, crema de calabaza, arroz con pollo y verduras, huevos rotos con pimientos. Valen versiones rápidas (legumbre de bote, microondas, sartén).
- Nada de inventos ni fusiones raras: combina solo ingredientes que se comen juntos de forma clásica. Una proteína principal por plato, salvo combinaciones tradicionales. Pescado con legumbre solo si es una receta tradicional conocida (potaje de vigilia con bacalao); nunca cosas como merluza con lentejas.
- nombre: el nombre normal del plato, como en una carta. Sin juegos de palabras, chistes ni referencias deportivas.
- basada_en: la receta tradicional en la que se basa.
- descripcion: una frase sencilla sobre por qué está bueno o por qué le viene bien hoy.
- Ingredientes de cualquier supermercado (Mercadona, Lidl, Carrefour).
- Ajusta cada idea a las calorías y macros indicadas: gramos reales y macros calculados con tablas españolas (BEDCA), incluido el aceite.
- Prioriza la proteína. Variedad: no repitas platos recientes ni la misma base en dos ideas.
- Pasos cortos y claros, como mucho 5, de una línea cada uno. Ingredientes: como mucho 7. Tiempo real de preparación.
- Respeta estrictamente las alergias y los alimentos que no come: ni como ingrediente ni como trazas obvias.`

const REALFOODING = `Modo comida real (realfooding): solo alimentos frescos o mínimamente procesados. Se permiten buenos procesados: legumbre cocida de bote, conservas de pescado al natural o en aceite de oliva, aceite de oliva virgen extra, yogur natural sin azúcar, queso fresco, pan 100 % integral, verdura congelada, tomate triturado natural, chocolate de más del 85 %. Prohibidos los ultraprocesados: pan de molde, wraps o tortillas de trigo industriales, embutidos y fiambres, salchichas, surimi, salsas comerciales (ketchup, tomate frito, barbacoa), cereales de desayuno, galletas, bollería, refrescos, zumos envasados, margarina y pastillas de caldo.`

export async function generateIdeas(r: IdeasRequest): Promise<{ ideas: Idea[]; discarded: number }> {
  const client = await getClient()
  const model = await getMainModel()
  const banned = bannedTerms(r.profile.allergies, r.profile.dietNotes)
  const month = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date())
  const prompt = [
    `Dame 4 ideas para ${mealLabel(r.mealType)}.`,
    `Su objetivo: ${goalSummary(goalOf(r.profile), (d) => d)}${goalOf(r.profile).type === 'strength' ? ' (prioriza bien la proteína)' : goalOf(r.profile).type === 'weight_loss' ? ' (platos saciantes, con mucha verdura y proteína)' : ''}.`,
    `Presupuesto: unos ${r.budget.kcal} kcal (±10 %), con al menos ${r.budget.protein} g de proteína; hidratos ≈ ${r.budget.carbs} g y grasa ≈ ${r.budget.fat} g.`,
    r.quick ? 'Tienen que ser rápidas: 15 minutos o menos.' : 'Máximo 30 minutos.',
    `Hoy es ${r.dayType === 'long' ? 'día de sesión larga (más hidratos)' : r.dayType === 'rest' ? 'día de descanso' : r.dayType === 'race' ? 'día de carrera' : 'día de entreno'}. Estamos en ${month}: usa producto de temporada.`,
    banned.length ? `Prohibido: ${banned.join(', ')}.` : 'Sin alergias conocidas.',
    r.profile.dietNotes ? `Preferencias: ${r.profile.dietNotes}` : '',
    r.craving ? `Le apetece o tiene en la nevera: ${r.craving}` : '',
    r.recentMeals.length ? `Ha comido estos días (no repitas): ${r.recentMeals.slice(0, 20).join('; ')}.` : '',
    r.realfooding ? REALFOODING : '',
  ]
    .filter(Boolean)
    .join('\n')

  const supportsFallback = model.startsWith('claude-sonnet') || model.startsWith('claude-opus')
  const out = await structured(
    client,
    {
      model,
      max_tokens: 16000,
      output_config: { effort: 'low', format: betaZodOutputFormat(IdeasSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      ...(supportsFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    },
    IdeasSchema,
    { refusal: 'No se han podido generar ideas. Prueba con otra petición.' },
  )

  // Filtro en código: nada que choque con alergias o vetos, ni ultraprocesados en modo realfooding
  const veto = r.realfooding ? [...banned, ...ULTRAPROCESSED_TERMS] : banned
  const safe = out.ideas.filter((i) => !violates([i.nombre, i.basada_en, i.descripcion, ...i.ingredientes.map((x) => x.nombre), ...i.pasos].join(' '), veto))
  const ideas = safe
    .map((i) => ({ ...i, kcal: Math.round(i.kcal), tiempo_min: Math.round(i.tiempo_min), fits: r.budget.kcal > 0 ? fitsBudget(i.kcal, r.budget.kcal) : true }))
    // Primero las que encajan en calorías
    .sort((a, b) => Number(b.fits) - Number(a.fits) || Math.abs(a.kcal - r.budget.kcal) - Math.abs(b.kcal - r.budget.kcal))
    .slice(0, 3)
  return { ideas, discarded: out.ideas.length - safe.length }
}

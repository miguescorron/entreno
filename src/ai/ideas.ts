import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { Profile } from '../db/db'
import type { DayType } from '../domain/nutrition/targets'
import { bannedTerms, fitsBudget, violates, type Budget, type MealType } from '../domain/nutrition/ideas'
import { getClient, getMainModel } from './client'

// Ideas de comida rápidas y con gracia, ajustadas a lo que queda del día.
// El modelo propone; el código comprueba calorías y alergias antes de enseñarlas.

export const IdeaSchema = z.object({
  nombre: z.string(),
  gancho: z.string().describe('Una frase con gracia que la venda'),
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
}

const SYSTEM = `Eres un cocinero y nutricionista deportivo con mucha chispa. Propones comidas rápidas, ricas y fáciles para un triatleta aficionado en España.
Reglas:
- Cocina mediterránea y española de diario, con ingredientes de cualquier supermercado (Mercadona, Lidl, Carrefour). Nada de ingredientes raros.
- Nombres con gracia y gancho (juegos de palabras, guiños deportivos), pero que se entienda qué es.
- Ajusta cada idea a las calorías y macros indicadas: usa gramos reales y calcula los macros con tablas españolas (BEDCA), incluido el aceite.
- Prioriza la proteína. Variedad: no repitas platos recientes ni la misma base en dos ideas.
- Pasos cortos y claros, como mucho 5. Tiempo real de preparación.
- Respeta estrictamente las alergias y los alimentos que no come: ni como ingrediente ni como trazas obvias.`

export async function generateIdeas(r: IdeasRequest): Promise<{ ideas: Idea[]; discarded: number }> {
  const client = await getClient()
  const model = await getMainModel()
  const banned = bannedTerms(r.profile.allergies, r.profile.dietNotes)
  const month = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date())
  const prompt = [
    `Dame 4 ideas para ${r.mealType === 'entreno' ? 'tomar alrededor del entreno' : `el ${r.mealType}`}.`,
    `Presupuesto: unos ${r.budget.kcal} kcal (±10 %), con al menos ${r.budget.protein} g de proteína; hidratos ≈ ${r.budget.carbs} g y grasa ≈ ${r.budget.fat} g.`,
    r.quick ? 'Tienen que ser rápidas: 15 minutos o menos.' : 'Máximo 30 minutos.',
    `Hoy es ${r.dayType === 'long' ? 'día de sesión larga (más hidratos)' : r.dayType === 'rest' ? 'día de descanso' : r.dayType === 'race' ? 'día de carrera' : 'día de entreno'}. Estamos en ${month}: usa producto de temporada.`,
    banned.length ? `Prohibido: ${banned.join(', ')}.` : 'Sin alergias conocidas.',
    r.profile.dietNotes ? `Preferencias: ${r.profile.dietNotes}` : '',
    r.craving ? `Le apetece o tiene en la nevera: ${r.craving}` : '',
    r.recentMeals.length ? `Ha comido estos días (no repitas): ${r.recentMeals.slice(0, 20).join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const supportsFallback = model.startsWith('claude-sonnet') || model.startsWith('claude-opus')
  const msg = await client.beta.messages.parse({
    model,
    max_tokens: 6000,
    output_config: { effort: 'low', format: betaZodOutputFormat(IdeasSchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    ...(supportsFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  })
  if (msg.stop_reason === 'refusal') throw new Error('No se han podido generar ideas. Prueba con otra petición.')
  if (msg.stop_reason === 'max_tokens') throw new Error('La respuesta se ha cortado. Prueba otra vez.')
  const out = IdeasSchema.parse(msg.parsed_output)

  // Filtro en código: nada que choque con alergias o vetos
  const safe = out.ideas.filter((i) => !violates([i.nombre, i.gancho, ...i.ingredientes.map((x) => x.nombre), ...i.pasos].join(' '), banned))
  const ideas = safe
    .map((i) => ({ ...i, kcal: Math.round(i.kcal), tiempo_min: Math.round(i.tiempo_min), fits: r.budget.kcal > 0 ? fitsBudget(i.kcal, r.budget.kcal) : true }))
    // Primero las que encajan en calorías
    .sort((a, b) => Number(b.fits) - Number(a.fits) || Math.abs(a.kcal - r.budget.kcal) - Math.abs(b.kcal - r.budget.kcal))
    .slice(0, 3)
  return { ideas, discarded: out.ideas.length - safe.length }
}

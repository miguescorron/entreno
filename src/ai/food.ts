import type Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { blobToBase64 } from '../lib/image'
import { getClient, getMainModel, MODEL_FAST } from './client'
import { structured } from './structured'

// Calculadora de macros por imagen o texto (spec §9). El modelo devuelve
// JSON estricto y se valida con zod antes de guardar nada.

export const PlatoSchema = z.object({
  nombre: z.string(),
  gramos_estimados: z.number(),
  rango_gramos: z.array(z.number()),
  kcal: z.number(),
  proteina_g: z.number(),
  hidratos_g: z.number(),
  grasa_g: z.number(),
  fibra_g: z.number(),
  confianza: z.number(),
  supuestos: z.array(z.string()),
})

export const EstimacionSchema = z.object({
  platos: z.array(PlatoSchema),
  preguntas_aclaratorias: z.array(z.string()),
})

export type Plato = z.infer<typeof PlatoSchema>
export type Estimacion = z.infer<typeof EstimacionSchema>

export const EtiquetaSchema = z.object({
  es_etiqueta: z.boolean(),
  nombre: z.string(),
  marca: z.string(),
  por_100g: z.object({
    kcal: z.number(),
    proteina_g: z.number(),
    hidratos_g: z.number(),
    grasa_g: z.number(),
    fibra_g: z.number(),
  }),
  racion_g: z.number(),
})

export type Etiqueta = z.infer<typeof EtiquetaSchema>

const SYSTEM_PLATOS = `Eres un nutricionista deportivo que estima cantidades y macronutrientes de comida, sobre todo cocina mediterránea y española.
Reglas:
- Separa cada alimento o plato reconocible en una entrada distinta (por ejemplo, "Arroz con pollo" y "Ensalada").
- Estima los gramos de lo que se va a comer, no del envase. Da un rango realista (mínimo y máximo) en rango_gramos.
- Incluye el aceite de cocinado o aliño que sea razonable suponer y anótalo en supuestos.
- Usa valores nutricionales de tablas de composición españolas (BEDCA) cuando sea posible.
- confianza entre 0 y 1: baja si la porción, la salsa o la preparación no se ven bien.
- preguntas_aclaratorias: como mucho 2, solo si cambian mucho el resultado. Lista vacía si no hacen falta.
- Si te dan un objeto de referencia para la escala, úsalo.
- Nombres en español de España. fibra_g: 0 si no la sabes.
- Si en la imagen no hay comida, devuelve platos vacío y una pregunta explicándolo.`

const SYSTEM_ETIQUETA = `Lees etiquetas nutricionales de productos envasados (en español u otros idiomas de la UE).
Devuelve los valores por 100 g (o 100 ml). Si la etiqueta solo da valores por ración, conviértelos a 100 g usando el tamaño de la ración.
racion_g: tamaño de la ración indicado en la etiqueta, o 0 si no aparece.
Si la imagen no es una etiqueta nutricional, es_etiqueta = false y el resto a 0 o vacío.`

const REFUSAL = { refusal: 'El modelo no ha podido analizar esta petición. Prueba con otra foto o descríbelo con texto.' }

async function imageBlock(photo: Blob): Promise<Anthropic.Beta.BetaImageBlockParam> {
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64(photo) } }
}

/** Foto del plato → platos con gramos, rango, macros y supuestos. */
export async function estimateFromPhoto(photo: Blob, opts: { reference?: string; note?: string } = {}): Promise<Estimacion> {
  const client = await getClient()
  const model = await getMainModel()
  const hints = [opts.reference && `Objeto de referencia en la foto: ${opts.reference}.`, opts.note && `Nota del usuario: ${opts.note}`].filter(Boolean).join('\n')
  return structured(
    client,
    {
      model,
      max_tokens: 16000,
      // Si el modelo declina por política, el servidor reintenta con su fallback por defecto
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(EstimacionSchema) },
      system: SYSTEM_PLATOS,
      messages: [{ role: 'user', content: [await imageBlock(photo), { type: 'text', text: `Estima los platos de esta foto.${hints ? `\n${hints}` : ''}` }] }],
    },
    EstimacionSchema,
    REFUSAL,
  )
}

/** Texto o dictado ("dos tostadas con aceite y jamón y un café con leche") → platos. */
export async function estimateFromText(text: string): Promise<Estimacion> {
  const client = await getClient()
  return structured(
    client,
    {
      model: MODEL_FAST,
      max_tokens: 16000,
      output_config: { effort: 'low', format: betaZodOutputFormat(EstimacionSchema) },
      system: SYSTEM_PLATOS,
      messages: [{ role: 'user', content: `Estima lo que he comido: ${text}` }],
    },
    EstimacionSchema,
    REFUSAL,
  )
}

/** Foto de la etiqueta nutricional → valores por 100 g. */
export async function readLabel(photo: Blob): Promise<Etiqueta> {
  const client = await getClient()
  return structured(
    client,
    {
      model: MODEL_FAST,
      max_tokens: 16000,
      output_config: { effort: 'low', format: betaZodOutputFormat(EtiquetaSchema) },
      system: SYSTEM_ETIQUETA,
      messages: [{ role: 'user', content: [await imageBlock(photo), { type: 'text', text: 'Lee esta etiqueta nutricional.' }] }],
    },
    EtiquetaSchema,
    REFUSAL,
  )
}

/** Normaliza lo que devuelve el modelo (rangos al revés, negativos, confianza fuera de 0-1). */
export function sanitizePlato(p: Plato): Plato {
  const g = Math.max(1, Math.round(p.gramos_estimados))
  const [a = g * 0.8, b = g * 1.2] = p.rango_gramos
  const lo = Math.max(1, Math.round(Math.min(a, b, g)))
  const hi = Math.round(Math.max(a, b, g))
  const nn = (n: number) => Math.max(0, Math.round(n * 10) / 10)
  return {
    ...p,
    gramos_estimados: g,
    rango_gramos: [lo, hi],
    kcal: Math.max(0, Math.round(p.kcal)),
    proteina_g: nn(p.proteina_g),
    hidratos_g: nn(p.hidratos_g),
    grasa_g: nn(p.grasa_g),
    fibra_g: nn(p.fibra_g),
    confianza: Math.min(1, Math.max(0, p.confianza)),
  }
}

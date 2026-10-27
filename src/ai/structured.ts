import type Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'

// Llamada con salida JSON estricta. Comprueba el motivo de parada antes de
// leer nada, valida con zod y reintenta una vez si la respuesta llega cortada.
// Los modelos con razonamiento gastan parte de max_tokens pensando: por eso el
// mínimo es generoso.

const MIN_TOKENS = 16_000

export class StructuredError extends Error {}

export async function structured<S extends z.ZodType>(
  client: Anthropic,
  params: Anthropic.Beta.MessageCreateParamsNonStreaming,
  schema: S,
  messages: { refusal: string },
): Promise<z.infer<S>> {
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await client.beta.messages.create({ ...params, max_tokens: Math.max(params.max_tokens, MIN_TOKENS) })
    if (msg.stop_reason === 'refusal') throw new StructuredError(messages.refusal)
    if (msg.stop_reason === 'max_tokens') {
      lastError = 'La respuesta de Claude se ha cortado.'
      continue
    }
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      lastError = 'La respuesta de Claude llegó incompleta.'
      continue
    }
    const parsed = schema.safeParse(json)
    if (parsed.success) return parsed.data
    lastError = 'La respuesta de Claude no tenía el formato esperado.'
  }
  throw new StructuredError(`${lastError} Prueba otra vez.`)
}

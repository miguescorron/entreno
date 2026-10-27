import Anthropic from '@anthropic-ai/sdk'
import { getSetting } from '../db/db'

// La app no tiene servidor: llama a la API de Claude directamente desde el
// iPhone con la clave del usuario, guardada solo en el dispositivo.

export const MODEL_FAST = 'claude-haiku-5-5'
export const MODEL_DEFAULT = 'claude-sonnet-5-5'

export class NoApiKeyError extends Error {
  constructor() {
    super('Configura tu clave de API de Claude en Ajustes.')
  }
}

export async function getClient(): Promise<Anthropic> {
  const apiKey = await getSetting<string>('anthropicApiKey', '')
  if (!apiKey) throw new NoApiKeyError()
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 90_000 })
}

/** Modelo elegido en Ajustes para coach y visión. */
export async function getMainModel(): Promise<string> {
  return getSetting<string>('apiModel', MODEL_DEFAULT)
}

/** Mensaje de error legible en español. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof NoApiKeyError) return e.message
  if (e instanceof Anthropic.AuthenticationError) return 'La clave de API no es válida. Revísala en Ajustes.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'Tu clave no tiene permiso para este modelo.'
  if (e instanceof Anthropic.RateLimitError) return 'Demasiadas peticiones o límite de gasto alcanzado. Prueba en un rato.'
  if (e instanceof Anthropic.BadRequestError) return `Petición rechazada: ${e.message}`
  if (e instanceof Anthropic.APIConnectionError)
    return import.meta.env.VITE_ARTIFACT
      ? 'En la vista previa (artefacto de Claude) no se puede llamar a la API. Prueba la clave en la app abierta desde Safari.'
      : 'Sin conexión. La IA necesita internet; el resto de la app funciona sin ella.'
  if (e instanceof Anthropic.APIError) return `Error de la API (${e.status}). Prueba de nuevo.`
  if (e instanceof Error) return e.message
  return 'Algo ha fallado.'
}

/** Llamada mínima para comprobar que la clave y el modelo elegido funcionan. */
export async function testConnection(): Promise<{ model: string; ms: number }> {
  const client = await getClient()
  const model = await getMainModel()
  const t0 = performance.now()
  const msg = await client.messages.create({
    model,
    max_tokens: 200,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: 'Responde solo: OK' }],
  })
  if (msg.stop_reason === 'refusal') throw new Error('La API respondió pero rechazó la petición de prueba.')
  return { model: msg.model, ms: Math.round(performance.now() - t0) }
}

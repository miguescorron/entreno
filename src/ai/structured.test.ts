import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { structured, StructuredError } from './structured'

const Schema = z.object({ ok: z.boolean() })

function fakeClient(responses: { stop_reason: string; text: string }[]) {
  const calls: { max_tokens: number }[] = []
  const client = {
    beta: {
      messages: {
        create: async (p: { max_tokens: number }) => {
          calls.push(p)
          const r = responses.shift()!
          return { stop_reason: r.stop_reason, content: [{ type: 'text', text: r.text }] }
        },
      },
    },
  } as unknown as Anthropic
  return { client, calls }
}

const params = { model: 'x', max_tokens: 4000, messages: [] } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming

describe('salida JSON estricta', () => {
  it('sube max_tokens para dejar sitio al razonamiento', async () => {
    const { client, calls } = fakeClient([{ stop_reason: 'end_turn', text: '{"ok":true}' }])
    expect(await structured(client, params, Schema, { refusal: 'no' })).toEqual({ ok: true })
    expect(calls[0].max_tokens).toBe(16000)
  })

  it('reintenta una vez si la respuesta llega cortada', async () => {
    const { client, calls } = fakeClient([
      { stop_reason: 'max_tokens', text: '{"ok":tr' },
      { stop_reason: 'end_turn', text: '{"ok":true}' },
    ])
    expect(await structured(client, params, Schema, { refusal: 'no' })).toEqual({ ok: true })
    expect(calls).toHaveLength(2)
  })

  it('JSON roto dos veces: error claro en español', async () => {
    const { client } = fakeClient([
      { stop_reason: 'end_turn', text: '{"ok":"sin cerrar' },
      { stop_reason: 'end_turn', text: '{"ok":"sin cerrar' },
    ])
    await expect(structured(client, params, Schema, { refusal: 'no' })).rejects.toThrow(/incompleta\. Prueba otra vez/)
  })

  it('rechazo: no reintenta y usa el mensaje dado', async () => {
    const { client, calls } = fakeClient([{ stop_reason: 'refusal', text: '' }])
    await expect(structured(client, params, Schema, { refusal: 'No se pudo' })).rejects.toBeInstanceOf(StructuredError)
    expect(calls).toHaveLength(1)
  })
})

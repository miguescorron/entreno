import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportData } from '../../db/backup'
import { db, setSetting } from '../../db/db'
import { imagesOf } from './coach'

const img = (data: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('fotos en el chat del coach', () => {
  it('extrae las fotos de un mensaje como data URL', () => {
    const m = { blocks: [{ type: 'text', text: 'contexto' }, img('AAAA'), img('BBBB'), { type: 'text', text: 'mira' }] }
    expect(imagesOf(m)).toEqual(['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'])
    expect(imagesOf({ blocks: undefined })).toEqual([])
  })

  it('las copias de seguridad no llevan las fotos ni la sesión del coach', async () => {
    await db.chatMessages.add({ ts: '2026-11-12T10:00:00Z', role: 'user', text: 'mi plato', sessionId: 's-1', blocks: [{ type: 'text', text: 'ctx' }, img('X'.repeat(5000)), { type: 'text', text: 'mi plato' }] })
    await setSetting('coachSession', { id: 's-1' })
    const backup = await exportData()
    const json = JSON.stringify(backup)
    expect(json).not.toContain('XXXX')
    expect(json).toContain('[foto no incluida en la copia]')
    expect(backup.data.settings.some((r) => r.key === 'coachSession')).toBe(false)
  })
})

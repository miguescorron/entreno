import { z } from 'zod'
import { db, SECRET_SETTINGS, TABLE_NAMES } from './db'

const BackupSchema = z.object({
  app: z.literal('entreno'),
  version: z.number(),
  exportedAt: z.string(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
})

export type Backup = z.infer<typeof BackupSchema>

export async function exportData(): Promise<Backup> {
  const data: Record<string, Record<string, unknown>[]> = {}
  for (const name of TABLE_NAMES) {
    const rows = (await db.table(name).toArray()) as Record<string, unknown>[]
    data[name] = name === 'settings' ? rows.filter((r) => !SECRET_SETTINGS.has(String(r.key))) : rows
  }
  // Las fotos (Blob) no van en el JSON
  data.mealLogs = data.mealLogs.map(({ photoBlob: _p, ...r }) => r)
  return { app: 'entreno', version: db.verno, exportedAt: new Date().toISOString(), data }
}

export async function downloadBackup() {
  const backup = await exportData()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const name = `entreno-backup-${backup.exportedAt.slice(0, 10)}.json`
  const file = new File([blob], name, { type: 'application/json' })
  // En iPhone, la hoja de compartir permite guardarlo en Archivos / iCloud Drive
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Sustituye todos los datos por los del backup (conserva la API key). */
export async function importData(json: unknown) {
  const backup = BackupSchema.parse(json)
  await db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), async () => {
    for (const name of TABLE_NAMES) {
      const rows = backup.data[name] ?? []
      if (name === 'settings') {
        const secrets = (await db.settings.toArray()).filter((r) => SECRET_SETTINGS.has(r.key))
        await db.settings.clear()
        await db.settings.bulkAdd([...rows.filter((r) => !SECRET_SETTINGS.has(String(r.key))), ...secrets] as never[])
      } else {
        await db.table(name).clear()
        await db.table(name).bulkAdd(rows)
      }
    }
  })
}

export async function wipeAll() {
  await db.delete()
  await db.open()
}

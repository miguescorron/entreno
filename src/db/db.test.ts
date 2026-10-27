import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportData, importData } from './backup'
import { db, setSetting, type Profile } from './db'
import { logSkip, regeneratePlan } from './plan'

const profile: Profile = {
  name: 'Atleta',
  sex: 'male',
  birthDate: '1985-01-01',
  heightCm: 170,
  startWeightKg: 88,
  goalWeightKg: 75,
  raceName: 'ICAN Gandía 70.3',
  raceDate: '2027-10-10',
  weeklyHoursAvailable: 10,
  availableDays: [0, 1, 2, 3, 4, 5, 6],
  preferredTime: 'mañana',
  swimCrawl: 'basic',
  swimContinuousM: 100,
  poolNearby: true,
  bikeType: 'road',
  hasHelmet: true,
  hasTrainer: false,
  device: 'apple_watch',
  injuriesNotes: '',
  medicalCheckDone: false,
  allergies: '',
  dietNotes: '',
  mealTimes: '',
  createdAt: '2026-10-19T00:00:00Z',
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('plan en base de datos', () => {
  it('genera 51 semanas y conserva las sesiones registradas al regenerar', async () => {
    await regeneratePlan(profile)
    expect(await db.planWeeks.count()).toBe(51)
    const first = (await db.planSessions.where('date').equals('2026-10-20').first())!
    await logSkip(first, 'trabajo')
    const before = await db.planSessions.count()

    await regeneratePlan(profile, 1)
    expect(await db.planWeeks.count()).toBe(51)
    expect(await db.planSessions.count()).toBe(before)
    expect((await db.planSessions.get(first.id!))?.status).toBe('skipped')
  })
})

describe('backup', () => {
  it('exporta e importa sin perder datos y sin incluir la API key', async () => {
    await db.profile.add(profile)
    await db.bodyLogs.add({ date: '2026-10-19', weightKg: 88 })
    await setSetting('anthropicApiKey', 'sk-test')
    const backup = await exportData()
    expect(JSON.stringify(backup)).not.toContain('sk-test')

    await db.bodyLogs.clear()
    await importData(JSON.parse(JSON.stringify(backup)))
    expect(await db.bodyLogs.count()).toBe(1)
    expect((await db.settings.get('anthropicApiKey'))?.value).toBe('sk-test')
  })

  it('rechaza un JSON que no es un backup', async () => {
    await expect(importData({ foo: 1 })).rejects.toThrow()
  })
})

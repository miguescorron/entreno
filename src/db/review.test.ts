import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Profile } from './db'
import { regeneratePlan } from './plan'
import { parseReview, reviewWeekFor, saveReview } from './review'

const profile: Profile = {
  name: 'Atleta', sex: 'male', birthDate: '1985-01-01', heightCm: 170, startWeightKg: 88, goalWeightKg: 75,
  raceName: 'ICAN Gandía 70.3', raceDate: '2027-10-10', weeklyHoursAvailable: 10, availableDays: [0, 1, 2, 3, 4, 5, 6],
  preferredTime: 'temprano', swimCrawl: 'basic', swimContinuousM: 50, poolNearby: true, bikeType: 'road', hasHelmet: true,
  hasTrainer: false, device: 'none', injuriesNotes: '', medicalCheckDone: true, allergies: '', dietNotes: '', mealTimes: '', createdAt: '',
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.profile.add(profile)
  await regeneratePlan(profile)
})

describe('revisión semanal', () => {
  it('el domingo desde las 18:00 revisa la semana actual; si no, la anterior', () => {
    expect(reviewWeekFor('2026-10-19', '2026-10-25', 19)).toBe(1)
    expect(reviewWeekFor('2026-10-19', '2026-10-25', 12)).toBeNull()
    expect(reviewWeekFor('2026-10-19', '2026-10-27', 9)).toBe(1)
    expect(reviewWeekFor('2026-10-19', '2026-10-10', 9)).toBeNull()
  })

  it('los ajustes se guardan como propuestas pendientes y los imposibles se descartan', async () => {
    const s = (await db.planSessions.where('weekNumber').equals(2).first())!
    const base = { session_id: null, new_date: null, new_duration_min: null, new_title: null, new_description: null, week: null, percent: null }
    const id = await saveReview(1, {
      resumen: 'Buena semana.',
      acierto: 'Constancia',
      mejora: 'Dormir más',
      ajustes: [
        { ...base, change: 'modify', session_id: s.id!, new_duration_min: 20, reason: 'gemelo' },
        { ...base, change: 'move', session_id: 99999, new_date: '2026-10-30', reason: 'no existe' },
      ],
    }, 'green')
    const r = (await db.weeklyReviews.get(id))!
    expect(parseReview(r.summaryText)).toMatchObject({ resumen: 'Buena semana.', light: 'green' })
    expect((r.adjustmentsJson as { proposalIds: number[] }).proposalIds).toHaveLength(1)
    expect(await db.planProposals.where('status').equals('pending').count()).toBe(1)
    expect((await db.planSessions.get(s.id!))!.durationMin).toBe(s.durationMin)
  })
})

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Profile } from './db'
import { regeneratePlan } from './plan'
import { acceptProposal, createProposal, ProposalError, rejectProposal, weekMinutes } from './proposals'

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

const firstRun = () => db.planSessions.where('weekNumber').equals(2).filter((s) => s.sport === 'run').first().then((s) => s!)

describe('propuestas de cambio del plan', () => {
  it('no cambia nada hasta que se acepta', async () => {
    const s = await firstRun()
    const p = await createProposal({ kind: 'move', sessionId: s.id, newDate: '2026-10-29', reason: 'trabajo' })
    expect(p.summary).toContain('Mover')
    expect((await db.planSessions.get(s.id!))!.date).toBe(s.date)
    await acceptProposal(p.id!)
    expect((await db.planSessions.get(s.id!))!.date).toBe('2026-10-29')
    expect((await db.planProposals.get(p.id!))!.status).toBe('accepted')
  })

  it('rechazar no toca el plan', async () => {
    const s = await firstRun()
    const p = await createProposal({ kind: 'modify', sessionId: s.id, newDurationMin: 20, reason: 'cansancio' })
    await rejectProposal(p.id!)
    await acceptProposal(p.id!) // ya decidida: no hace nada
    expect((await db.planSessions.get(s.id!))!.durationMin).toBe(s.durationMin)
  })

  it('acortar una sesión', async () => {
    const s = await firstRun()
    const p = await createProposal({ kind: 'modify', sessionId: s.id, newDurationMin: 20, reason: 'molestia' })
    await acceptProposal(p.id!)
    expect((await db.planSessions.get(s.id!))!.durationMin).toBe(20)
  })

  it('bajar el volumen de una semana', async () => {
    const before = await weekMinutes(3)
    const p = await createProposal({ kind: 'reduce_week', week: 3, percent: 15, reason: 'fatiga' })
    await acceptProposal(p.id!)
    expect(await weekMinutes(3)).toBeLessThan(before * 0.9)
  })

  it('repetir semana copia la semana anterior', async () => {
    const p = await createProposal({ kind: 'repeat_week', week: 2, reason: 'adherencia baja' })
    await acceptProposal(p.id!)
    const w2 = await db.planSessions.where('weekNumber').equals(2).toArray()
    const w3 = await db.planSessions.where('weekNumber').equals(3).toArray()
    expect(w3.map((s) => s.title).sort()).toEqual(w2.map((s) => s.title).sort())
  })

  it('rechaza propuestas imposibles', async () => {
    await expect(createProposal({ kind: 'move', sessionId: 99999, newDate: '2026-10-29', reason: '' })).rejects.toBeInstanceOf(ProposalError)
    await expect(createProposal({ kind: 'reduce_week', week: 3, percent: 95, reason: '' })).rejects.toBeInstanceOf(ProposalError)
  })
})

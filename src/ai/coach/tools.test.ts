import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Profile } from '../../db/db'
import { getAlarm } from '../../db/guardrails'
import { regeneratePlan } from '../../db/plan'
import { contextBlock, undoAction } from './coach'
import { makeTools, runTool, type ToolContext } from './tools'

const profile: Profile = {
  name: 'Atleta', sex: 'male', birthDate: '1985-01-01', heightCm: 170, startWeightKg: 88, goalWeightKg: 75,
  raceName: 'ICAN Gandía 70.3', raceDate: '2027-10-10', weeklyHoursAvailable: 10, availableDays: [0, 1, 2, 3, 4, 5, 6],
  preferredTime: 'temprano', swimCrawl: 'basic', swimContinuousM: 50, poolNearby: true, bikeType: 'road', hasHelmet: true,
  hasTrainer: false, device: 'none', injuriesNotes: '', medicalCheckDone: true, allergies: '', dietNotes: '', mealTimes: '', createdAt: '',
}
const today = '2026-10-21' // miércoles S1: trote/caminata

let ctx: ToolContext
let tools: ReturnType<typeof makeTools>

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.profile.add(profile)
  await regeneratePlan(profile)
  ctx = { profile, today, actions: [] }
  tools = makeTools(ctx)
})

const workout = (over: Record<string, unknown> = {}) => ({
  date: null, sport: 'run', duration_min: 30, distance_km: null, avg_hr: null, rpe: 5, feeling: null,
  pain_zone: null, pain_level: null, weather: null, plan_session_id: null, is_extra: false, ...over,
})

describe('herramientas del coach', () => {
  it('log_workout se vincula a la sesión del plan de ese día', async () => {
    const r = await runTool(tools, 'log_workout', workout())
    expect(r.isError).toBe(false)
    const s = (await db.planSessions.where('date').equals(today).first())!
    expect(s.status).toBe('done')
    expect(ctx.actions[0]).toMatchObject({ kind: 'workout' })
    expect(ctx.actions[0].summary).toContain("30'")
  })

  it('deshacer devuelve la sesión a pendiente', async () => {
    await runTool(tools, 'log_workout', workout())
    const msgId = (await db.chatMessages.add({ ts: '', role: 'assistant', text: '', actions: ctx.actions }))!
    await undoAction(msgId, 0)
    expect(await db.workoutLogs.count()).toBe(0)
    expect((await db.planSessions.where('date').equals(today).first())!.status).toBe('planned')
    expect((await db.chatMessages.get(msgId))!.actions![0].undone).toBe(true)
  })

  it('rechaza entradas inválidas sin romper', async () => {
    expect((await runTool(tools, 'log_workout', { sport: 'run' })).isError).toBe(true)
    expect((await runTool(tools, 'log_workout', workout({ date: '2030-01-01' }))).isError).toBe(true)
    expect((await runTool(tools, 'no_existe', {})).isError).toBe(true)
  })

  it('log_checkin completa sin borrar lo que había y se deshace', async () => {
    await db.checkins.add({ date: today, sleepHours: 7 })
    await runTool(tools, 'log_checkin', { date: null, sleep_hours: null, sleep_quality: null, energy: 2, mood: null, pain_zone: null, pain_level: null, notes: null })
    expect(await db.checkins.where('date').equals(today).first()).toMatchObject({ sleepHours: 7, energy: 2 })
    const msgId = (await db.chatMessages.add({ ts: '', role: 'assistant', text: '', actions: ctx.actions }))!
    await undoAction(msgId, 0)
    expect((await db.checkins.where('date').equals(today).first())!.energy).toBeUndefined()
  })

  it('el freno de ambición viaja en el resultado', async () => {
    for (const d of ['2026-10-19', '2026-10-20']) await runTool(tools, 'log_workout', workout({ date: d, rpe: 8, is_extra: true }))
    const r = await runTool(tools, 'log_workout', workout({ rpe: 8, is_extra: true }))
    expect(JSON.parse(r.content).alertas_nuevas.map((a: { key: string }) => a.key)).toContain('hard_streak')
  })

  it('propose_plan_change crea una propuesta pendiente y no toca el plan', async () => {
    const s = (await db.planSessions.where('date').equals(today).first())!
    const r = await runTool(tools, 'propose_plan_change', { change: 'modify', session_id: s.id, new_date: null, new_duration_min: 20, new_title: null, new_description: null, week: null, percent: null, reason: 'gemelo cargado' })
    expect(r.isError).toBe(false)
    expect((await db.planSessions.get(s.id!))!.durationMin).toBe(s.durationMin)
    expect(await db.planProposals.where('status').equals('pending').count()).toBe(1)
  })

  it('report_alarm_signal activa el aviso fijo', async () => {
    await runTool(tools, 'report_alarm_signal', { symptoms: ['dolor en el pecho'], quote: 'me dolía el pecho' })
    expect((await getAlarm())?.symptoms).toEqual(['dolor en el pecho'])
  })

  it('get_progress y get_plan devuelven JSON', async () => {
    expect(JSON.parse((await runTool(tools, 'get_progress', { weeks: 2 })).content).semana_actual).toBe(1)
    expect(JSON.parse((await runTool(tools, 'get_plan', { from_date: '2026-10-19', to_date: '2026-10-25' })).content).length).toBeGreaterThan(5)
  })

  it('el bloque de contexto lleva fecha, sesiones con id y comida', async () => {
    const c = await contextBlock(profile, today)
    expect(c).toContain('2026-10-21')
    expect(c).toMatch(/\[id \d+\]/)
    expect(c).toContain('kcal')
  })
})

import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { getClient, getMainModel } from '../ai/client'
import { structured } from '../ai/structured'
import { COACH_BASE_PROMPT, profileBlock } from '../ai/coach/prompt'
import { addDays, todayISO, weekdayIndex, weekNumberFor, weekStart, type ISODate } from '../domain/dates'
import { fmtMin } from '../domain/plan/generator'
import { db, getSetting, setSetting, type Profile, type ProposalKind } from './db'
import { currentAlerts } from './guardrails'
import { planStartFor } from './plan'
import { milestoneStatus, weeklyStats, weightSeries } from './progress'
import { createProposal } from './proposals'

// Revisión semanal (spec §8.6): el domingo por la noche (o al abrir la app
// después) Claude recibe plan vs realizado, peso, comida, check-ins, dolor e
// hitos, y devuelve resumen + 1 acierto + 1 mejora + ajustes. Los ajustes se
// guardan como propuestas que el usuario acepta o no.

export const ReviewSchema = z.object({
  resumen: z.string().describe('5 líneas como máximo'),
  acierto: z.string(),
  mejora: z.string(),
  ajustes: z.array(
    z.object({
      change: z.enum(['move', 'modify', 'remove', 'reduce_week', 'repeat_week']),
      session_id: z.number().nullable(),
      new_date: z.string().nullable(),
      new_duration_min: z.number().nullable(),
      new_title: z.string().nullable(),
      new_description: z.string().nullable(),
      week: z.number().nullable(),
      percent: z.number().nullable(),
      reason: z.string(),
    }),
  ),
})

export type ReviewOutput = z.infer<typeof ReviewSchema>

export interface ReviewSummary {
  resumen: string
  acierto: string
  mejora: string
  light?: string
}

/** Semana a revisar: la actual a partir del domingo a las 18:00; si no, la anterior. */
export function reviewWeekFor(planStart: ISODate, today: ISODate, hour: number): number | null {
  const week = weekNumberFor(planStart, today)
  if (!week) return today > planStart ? 51 : null
  if (weekdayIndex(today) === 6 && hour >= 18) return week
  return week > 1 ? week - 1 : null
}

async function reviewInput(profile: Profile, week: number, today: ISODate) {
  const planStart = planStartFor(profile)
  const start = weekStart(planStart, week)
  const end = addDays(start, 6)
  const [stats, sessions, logs, skips, checkins, weight, milestones, alerts, next] = await Promise.all([
    weeklyStats(profile, today),
    db.planSessions.where('weekNumber').equals(week).toArray(),
    db.workoutLogs.where('date').between(start, end, true, true).toArray(),
    db.skipLogs.where('date').between(start, end, true, true).toArray(),
    db.checkins.where('date').between(start, end, true, true).toArray(),
    weightSeries(profile, today),
    milestoneStatus(profile, today),
    currentAlerts(profile, today),
    db.planSessions.where('weekNumber').equals(week + 1).toArray(),
  ])
  const s = stats.find((x) => x.week === week)
  return {
    semana: week,
    fase: s?.phase,
    descarga: s?.isRecovery,
    semaforo: s?.light,
    plan_vs_realizado: sessions.map((x) => ({
      id: x.id,
      fecha: x.date,
      sesion: x.title,
      previsto: fmtMin(x.durationMin),
      estado: x.status,
      opcional: !!x.optional,
      realizado: logs.filter((l) => l.planSessionId === x.id).map((l) => ({ min: l.durationMin, rpe: l.rpe, dolor: l.painLevel ? `${l.painZone} ${l.painLevel}/10` : null, sensaciones: l.feelingText })),
      motivo_no_hecha: skips.find((k) => k.planSessionId === x.id)?.reasonCategory,
    })),
    extras: logs.filter((l) => l.isExtra).map((l) => ({ fecha: l.date, deporte: l.sport, min: l.durationMin, rpe: l.rpe })),
    volumen_min: s?.minutes,
    carga: s?.load,
    rpe_medio: s?.avgRpe,
    peso: { media_7d: weight.currentKg, objetivo: profile.goalWeightKg, pendiente_kg_semana: weight.projection?.slopePerWeek ?? null },
    comida: { kcal_media: s?.avgKcal, proteina_media_g: s?.avgProtein },
    checkins: checkins.map((c) => ({ fecha: c.date, sueno_h: c.sleepHours, energia: c.energy, animo: c.mood, dolor: c.painLevel ? `${c.painZone} ${c.painLevel}/10` : null, notas: c.freeText })),
    alertas_freno_ambicion: alerts.map((a) => a.title),
    hitos: milestones.filter((m) => m.status !== 'future').map((m) => ({ hito: m.key, estado: m.status, razon: m.reason })),
    semana_siguiente: next.map((x) => ({ id: x.id, fecha: x.date, sesion: x.title, duracion: fmtMin(x.durationMin), estado: x.status })),
  }
}

const REVIEW_INSTRUCTIONS = `Haz la revisión semanal del atleta con estos datos.
Devuelve:
- resumen: 5 líneas como máximo, concretas y basadas en los datos.
- acierto: una cosa que ha ido bien.
- mejora: una cosa a mejorar, accionable.
- ajustes: cambios para la semana siguiente solo si hacen falta (lista vacía si el plan está bien). Usa los ids de semana_siguiente. Sigue el semáforo: verde = seguir el plan; amarillo = repetir la semana o bajar un 15 %; rojo = descarga y valoración profesional. Nunca subas la carga más de un 10 %.`

export async function generateReview(profile: Profile, week: number, today = todayISO()) {
  const client = await getClient()
  const model = await getMainModel()
  const data = await reviewInput(profile, week, today)
  const supportsFallback = model.startsWith('claude-sonnet') || model.startsWith('claude-opus')
  const out = await structured(
    client,
    {
      model,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: betaZodOutputFormat(ReviewSchema) },
      system: `${COACH_BASE_PROMPT}\n\n${profileBlock(profile, today)}`,
      messages: [{ role: 'user', content: `${REVIEW_INSTRUCTIONS}\n\nDatos:\n${JSON.stringify(data)}` }],
      ...(supportsFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    },
    ReviewSchema,
    { refusal: 'No se ha podido generar la revisión.' },
  )
  return saveReview(week, out, data.semaforo?.light)
}

/** Guarda la revisión y convierte los ajustes en propuestas pendientes. */
export async function saveReview(week: number, out: ReviewOutput, light?: string) {
  const proposalIds: number[] = []
  const rejected: string[] = []
  for (const a of out.ajustes) {
    try {
      const p = await createProposal({
        kind: a.change as ProposalKind,
        sessionId: a.session_id ?? undefined,
        newDate: a.new_date ?? undefined,
        newDurationMin: a.new_duration_min ? Math.round(a.new_duration_min) : undefined,
        newTitle: a.new_title ?? undefined,
        newDescription: a.new_description ?? undefined,
        week: a.week ?? undefined,
        percent: a.percent ?? undefined,
        reason: a.reason,
      })
      proposalIds.push(p.id!)
    } catch (e) {
      rejected.push((e as Error).message)
    }
  }
  const summary: ReviewSummary = { resumen: out.resumen, acierto: out.acierto, mejora: out.mejora, light }
  const id = await db.weeklyReviews.add({
    weekNumber: week,
    summaryText: JSON.stringify(summary),
    adjustmentsJson: { proposalIds, raw: out.ajustes, rejected },
    createdAt: new Date().toISOString(),
  })
  return id
}

export function parseReview(text: string): ReviewSummary {
  try {
    return JSON.parse(text) as ReviewSummary
  } catch {
    return { resumen: text, acierto: '', mejora: '' }
  }
}

/** Genera la revisión pendiente automáticamente una vez (si hay clave). */
export async function maybeAutoReview(profile: Profile, today: ISODate, hour: number) {
  const week = reviewWeekFor(planStartFor(profile), today, hour)
  if (!week) return
  if (await db.weeklyReviews.where('weekNumber').equals(week).count()) return
  if (!(await getSetting<string>('anthropicApiKey', ''))) return
  const attempt = await getSetting<{ week: number; date: string } | null>('reviewAttempt', null)
  if (attempt?.week === week && attempt.date === today) return
  await setSetting('reviewAttempt', { week, date: today })
  await generateReview(profile, week, today)
}

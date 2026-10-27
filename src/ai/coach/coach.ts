import type Anthropic from '@anthropic-ai/sdk'
import { db, getSetting, setSetting, type ChatMessage, type CoachAction, type Profile } from '../../db/db'
import { getAlarm, pendingAlerts, raiseAlarm } from '../../db/guardrails'
import { targetsFor } from '../../db/nutrition'
import { phaseName, phaseOf, planStartFor, planWeeksFor, weekOf } from '../../db/plan'
import { formatDate, formatDayLong, type ISODate } from '../../domain/dates'
import { detectAlarmSignals } from '../../domain/guardrails/ambition'
import { getClient, getMainModel, MODEL_FAST } from '../client'
import { buildSystemPrompt, SUMMARY_PROMPT } from './prompt'
import { makeTools, runTool, type ToolContext } from './tools'

// Bucle del coach. El historial de cada sesión es solo de añadir (nunca se
// edita), así los bloques de thinking siguen siendo válidos y la caché de
// prompt funciona. Cuando la sesión crece, se resume y se abre otra nueva
// cuyo system prompt incluye el resumen ("compactación simple").

type MessageParam = Anthropic.Beta.BetaMessageParam
type ContentBlock = Anthropic.Beta.BetaContentBlockParam

interface CoachSession {
  id: string
  system: string
  profileHash: string
  summary: string
  startedAt: string
}

const SESSION_KEY = 'coachSession'
const MAX_SESSION_MESSAGES = 40
const MAX_SESSION_CHARS = 150_000
const MAX_TOOL_ROUNDS = 8

const hashProfile = (p: Profile) => JSON.stringify({ ...p, id: undefined, createdAt: undefined })

async function sessionMessages(sessionId: string): Promise<ChatMessage[]> {
  return db.chatMessages.where('sessionId').equals(sessionId).sortBy('id')
}

function toApiMessages(rows: ChatMessage[]): MessageParam[] {
  return rows
    .filter((r) => r.blocks?.length)
    .map((r) => ({ role: r.role === 'assistant' ? 'assistant' : 'user', content: r.blocks as ContentBlock[] }))
}

/** Texto de la sesión para resumirla (lo visible + lo guardado). */
function transcript(rows: ChatMessage[]): string {
  return rows
    .filter((r) => r.role !== 'tool' && (r.text || r.actions?.length))
    .map((r) => {
      const acts = r.actions?.filter((a) => !a.undone).map((a) => `[${a.kind}] ${a.summary}`) ?? []
      return `${r.role === 'user' ? 'Atleta' : 'Coach'} (${r.ts.slice(0, 10)}): ${r.text}${acts.length ? `\n  ${acts.join('\n  ')}` : ''}`
    })
    .join('\n')
}

async function summarize(previous: string, rows: ChatMessage[]): Promise<string> {
  const client = await getClient()
  const msg = await client.messages.create({
    model: MODEL_FAST,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system: SUMMARY_PROMPT,
    messages: [{ role: 'user', content: `${previous ? `Resumen anterior:\n${previous}\n\n` : ''}Conversación reciente:\n${transcript(rows)}` }],
  })
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/** Sesión vigente; si no hay, está llena o cambió el perfil, la compacta y abre otra. */
async function ensureSession(profile: Profile, today: ISODate): Promise<CoachSession> {
  const s = await getSetting<CoachSession | null>(SESSION_KEY, null)
  const hash = hashProfile(profile)
  if (s) {
    const rows = await sessionMessages(s.id)
    const size = rows.reduce((a, r) => a + JSON.stringify(r.blocks ?? '').length, 0)
    const full = rows.length >= MAX_SESSION_MESSAGES || size > MAX_SESSION_CHARS
    if (!full && s.profileHash === hash) return s
    const summary = rows.length ? await summarize(s.summary, rows) : s.summary
    return newSession(profile, today, summary)
  }
  return newSession(profile, today, '')
}

async function newSession(profile: Profile, today: ISODate, summary: string): Promise<CoachSession> {
  const s: CoachSession = {
    id: `s-${Date.now()}`,
    system: buildSystemPrompt(profile, today, summary || undefined),
    profileHash: hashProfile(profile),
    summary,
    startedAt: new Date().toISOString(),
  }
  await setSetting(SESSION_KEY, s)
  return s
}

/** Bloque de contexto que la app añade a cada mensaje (fecha, sesiones, comida, alertas). */
export async function contextBlock(profile: Profile, today: ISODate): Promise<string> {
  const planStart = planStartFor(profile)
  const week = weekOf(profile, today)
  const [sessions, meals, targets, alerts, alarm] = await Promise.all([
    db.planSessions.where('date').equals(today).toArray(),
    db.mealLogs.where('date').equals(today).toArray(),
    targetsFor(profile, today),
    pendingAlerts(profile, today),
    getAlarm(),
  ])
  const kcal = meals.reduce((a, m) => a + m.kcal, 0)
  const protein = Math.round(meals.reduce((a, m) => a + m.protein, 0))
  const lines = [
    '[Datos de la app — no lo ha escrito el atleta]',
    `Hoy: ${formatDayLong(today)} (${today}).${week ? ` Semana ${week}/${planWeeksFor(profile)}, fase ${phaseName(profile, phaseOf(profile, week))}.` : ` El plan empieza el ${formatDate(planStart)}.`}`,
    sessions.length
      ? `Sesiones de hoy: ${sessions.map((s) => `[id ${s.id}] ${s.title} ${s.durationMin}' (${s.status === 'planned' ? 'pendiente' : s.status === 'done' ? 'hecha' : s.status === 'skipped' ? 'no hecha' : s.status}${s.optional ? ', opcional' : ''})`).join('; ')}.`
      : 'Hoy no hay sesiones: descanso.',
    `Comida de hoy: ${kcal} de ${targets.kcal} kcal, proteína ${protein} de ${targets.proteinG} g.`,
    alerts.length ? `Alertas del freno de ambición: ${alerts.map((a) => a.title).join('; ')}.` : 'Sin alertas del freno de ambición.',
    alarm ? `AVISO DE ALARMA ACTIVO (${alarm.symptoms.join(', ')}): debe consultar con un médico antes de seguir el plan.` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export interface SendOptions {
  profile: Profile
  today: ISODate
  /** Texto de la respuesta mientras llega (streaming) */
  onText?: (text: string) => void
}

/** Envía un mensaje del usuario y ejecuta el bucle de herramientas hasta la respuesta final. */
export async function sendToCoach(text: string, { profile, today, onText }: SendOptions): Promise<void> {
  // Las señales de alarma se detectan también en código, sin depender del modelo
  const symptoms = detectAlarmSignals(text)
  if (symptoms.length) await raiseAlarm(symptoms, text)

  const client = await getClient()
  const model = await getMainModel()
  const session = await ensureSession(profile, today)
  const ts = () => new Date().toISOString()

  await db.chatMessages.add({
    ts: ts(),
    role: 'user',
    text,
    sessionId: session.id,
    blocks: [
      { type: 'text', text: await contextBlock(profile, today) },
      { type: 'text', text },
    ],
  })

  const ctx: ToolContext = { profile, today, actions: [] }
  const tools = makeTools(ctx)
  // Mismas definiciones en cada petición: el prefijo cacheado y el thinking siguen válidos
  const toolDefs = tools.map((t) => {
    const { name, description, input_schema } = t as unknown as Anthropic.Beta.BetaTool
    return { name, description, input_schema }
  })
  const supportsFallback = model.startsWith('claude-sonnet') || model.startsWith('claude-opus')

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const history = toApiMessages(await sessionMessages(session.id))
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 8000,
      system: session.system,
      tools: toolDefs as Anthropic.Beta.BetaTool[],
      messages: history,
      // Caché automática del prefijo (system + herramientas + historial)
      cache_control: { type: 'ephemeral' },
      output_config: { effort: 'medium' },
      ...(supportsFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    })
    stream.on('text', (_delta, snapshot) => onText?.(snapshot))
    const msg = await stream.finalMessage()

    const visible = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (msg.stop_reason === 'refusal') {
      await db.chatMessages.add({ ts: ts(), role: 'assistant', text: 'No puedo responder a eso. Prueba a contármelo de otra forma.', sessionId: session.id })
      return
    }

    const assistantId = await db.chatMessages.add({
      ts: ts(),
      role: 'assistant',
      text: visible,
      sessionId: session.id,
      // Se reenvía tal cual (thinking incluido) en la siguiente petición
      blocks: msg.content as unknown[],
    })

    const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (msg.stop_reason !== 'tool_use' || !toolUses.length) {
      if (msg.stop_reason === 'max_tokens' && !visible) await db.chatMessages.update(assistantId, { text: 'Me he quedado sin espacio para responder. Pregúntame algo más concreto.' })
      return
    }

    const before = ctx.actions.length
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const r = await runTool(tools, tu.name, tu.input)
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: r.content, is_error: r.isError || undefined })
    }
    await db.chatMessages.update(assistantId, { actions: ctx.actions.slice(before) })
    await db.chatMessages.add({ ts: ts(), role: 'tool', text: '', sessionId: session.id, blocks: results })
    onText?.('')
  }
}

// ---------- deshacer acciones del coach ----------

export async function undoAction(messageId: number, index: number) {
  const m = await db.chatMessages.get(messageId)
  const a: CoachAction | undefined = m?.actions?.[index]
  if (!m || !a || a.undone || !a.undo) return
  const u = a.undo
  await db.transaction('rw', [db.workoutLogs, db.planSessions, db.checkins, db.mealLogs, db.skipLogs, db.chatMessages], async () => {
    if (u.table === 'workoutLogs') {
      await db.workoutLogs.bulkDelete(u.ids ?? [])
      if (u.sessionId) await db.planSessions.update(u.sessionId, { status: 'planned' })
    } else if (u.table === 'mealLogs') {
      await db.mealLogs.bulkDelete(u.ids ?? [])
    } else if (u.table === 'skipLogs' && u.sessionId) {
      await db.skipLogs.where('planSessionId').equals(u.sessionId).delete()
      await db.planSessions.update(u.sessionId, { status: 'planned' })
    } else if (u.table === 'checkins') {
      const restore = u.restore as { date: string; isNew?: boolean }
      if (restore.isNew) await db.checkins.where('date').equals(restore.date).delete()
      else await db.checkins.put(restore as never)
    }
    const actions = [...(m.actions ?? [])]
    actions[index] = { ...a, undone: true }
    await db.chatMessages.update(messageId, { actions })
  })
}

export async function confirmAction(messageId: number, index: number) {
  const m = await db.chatMessages.get(messageId)
  if (!m?.actions?.[index]) return
  const actions = [...m.actions]
  actions[index] = { ...actions[index], confirmed: true }
  await db.chatMessages.update(messageId, { actions })
}

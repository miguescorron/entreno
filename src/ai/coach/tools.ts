import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { db, type CoachAction, type MealLog, type PlanSession, type Profile } from '../../db/db'
import { addMeals } from '../../db/food'
import { currentAlerts, getAlarm, newAlerts, raiseAlarm } from '../../db/guardrails'
import { getAdjustment, targetsFor } from '../../db/nutrition'
import { logSkip, logWorkout, planStartFor } from '../../db/plan'
import { createProposal, ProposalError } from '../../db/proposals'
import { addDays, diffDays, formatDate, mondayOf, weekNumberFor, weekStart, type ISODate } from '../../domain/dates'
import { MILESTONES } from '../../domain/milestones'
import { fmtMin, phaseForWeek, weekLoadMin } from '../../domain/plan/generator'
import { PHASE_LABEL, SPORT_LABEL } from '../../domain/types'

// Herramientas que la app expone al coach (spec §8.3). Todo lo que guarda
// queda como tarjeta en el chat, con opción de deshacer.

export interface ToolContext {
  profile: Profile
  today: ISODate
  actions: CoachAction[]
}

const SPORTS = ['swim', 'bike', 'run', 'walk', 'strength', 'brick', 'other'] as const
const ISO = /^\d{4}-\d{2}-\d{2}$/

class ToolInputError extends Error {}

function resolveDate(ctx: ToolContext, d: string | null, allowFuture = false): ISODate {
  if (!d) return ctx.today
  if (!ISO.test(d)) throw new ToolInputError(`Fecha inválida "${d}". Usa YYYY-MM-DD.`)
  if (!allowFuture && d > ctx.today) throw new ToolInputError('No se pueden registrar fechas futuras.')
  if (diffDays(ctx.today, d) > 60) throw new ToolInputError('Esa fecha es demasiado antigua.')
  return d
}

const clampInt = (n: number | null | undefined, lo: number, hi: number) => (n == null ? undefined : Math.round(Math.min(hi, Math.max(lo, n))))
const json = (o: unknown) => JSON.stringify(o)

export function makeTools(ctx: ToolContext) {
  const logCheckin = betaZodTool({
    name: 'log_checkin',
    description:
      'Guarda o completa el check-in de un día con lo que cuenta el atleta: horas y calidad de sueño (1-5), energía (1-5), ánimo (1-5), dolor (zona y 0-10) y notas. Los campos que no menciona van a null y no se tocan.',
    inputSchema: z.object({
      date: z.string().nullable().describe('YYYY-MM-DD; null = hoy'),
      sleep_hours: z.number().nullable(),
      sleep_quality: z.number().nullable().describe('1-5'),
      energy: z.number().nullable().describe('1-5'),
      mood: z.number().nullable().describe('1-5'),
      pain_zone: z.string().nullable().describe('Rodilla, Gemelo, Tobillo, Pie, Cadera, Espalda, Hombro u Otra'),
      pain_level: z.number().nullable().describe('0-10'),
      notes: z.string().nullable(),
    }),
    run: async (i) => {
      const date = resolveDate(ctx, i.date)
      const prev = await db.checkins.where('date').equals(date).first()
      const merged = {
        ...(prev ?? { date }),
        ...(i.sleep_hours != null ? { sleepHours: Math.min(14, Math.max(0, i.sleep_hours)) } : {}),
        ...(i.sleep_quality != null ? { sleepQuality: clampInt(i.sleep_quality, 1, 5) } : {}),
        ...(i.energy != null ? { energy: clampInt(i.energy, 1, 5) } : {}),
        ...(i.mood != null ? { mood: clampInt(i.mood, 1, 5) } : {}),
        ...(i.pain_zone && i.pain_level ? { painZone: i.pain_zone, painLevel: clampInt(i.pain_level, 0, 10) } : {}),
        ...(i.notes ? { freeText: [prev?.freeText, i.notes].filter(Boolean).join(' · ') } : {}),
      }
      const before = await currentAlerts(ctx.profile, ctx.today)
      await db.checkins.put(merged)
      const alerts = newAlerts(before, await currentAlerts(ctx.profile, ctx.today))
      const parts = [
        merged.sleepHours != null && `sueño ${String(merged.sleepHours).replace('.', ',')} h`,
        merged.energy && `energía ${merged.energy}/5`,
        merged.mood && `ánimo ${merged.mood}/5`,
        merged.painLevel && `${merged.painZone?.toLowerCase()} ${merged.painLevel}/10`,
      ].filter(Boolean)
      ctx.actions.push({ kind: 'checkin', summary: `Check-in ${formatDate(date)}: ${parts.join(', ') || 'notas'}`, undo: { table: 'checkins', restore: prev ?? { date, isNew: true } }, alerts })
      return json({ guardado: true, fecha: date, alertas_nuevas: alerts })
    },
  })

  const logWorkoutTool = betaZodTool({
    name: 'log_workout',
    description:
      'Guarda un entreno hecho (también dobles sesiones o extras). Si coincide con una sesión del plan de ese día, se vincula y se marca como hecha. Devuelve las alertas del freno de ambición que dispare.',
    inputSchema: z.object({
      date: z.string().nullable().describe('YYYY-MM-DD; null = hoy'),
      sport: z.enum(SPORTS),
      duration_min: z.number(),
      distance_km: z.number().nullable(),
      avg_hr: z.number().nullable(),
      rpe: z.number().describe('Esfuerzo percibido 1-10'),
      feeling: z.string().nullable(),
      pain_zone: z.string().nullable(),
      pain_level: z.number().nullable(),
      weather: z.string().nullable(),
      plan_session_id: z.number().nullable().describe('id de la sesión del plan si la conoces'),
      is_extra: z.boolean().describe('true si es una sesión fuera del plan'),
    }),
    run: async (i) => {
      const date = resolveDate(ctx, i.date)
      if (i.duration_min <= 0 || i.duration_min > 600) throw new ToolInputError('Duración fuera de rango.')
      let session: PlanSession | undefined
      if (i.plan_session_id) session = await db.planSessions.get(i.plan_session_id)
      else if (!i.is_extra)
        session = await db.planSessions
          .where('date')
          .equals(date)
          .filter((s) => s.status === 'planned' && (s.sport === i.sport || (i.sport === 'run' && s.sport === 'walk')))
          .first()
      const before = await currentAlerts(ctx.profile, ctx.today)
      const id = await logWorkout({
        planSessionId: session?.id,
        date,
        sport: i.sport,
        durationMin: Math.round(i.duration_min),
        distanceM: i.distance_km ? Math.round(i.distance_km * 1000) : undefined,
        avgHr: i.avg_hr ?? undefined,
        rpe: clampInt(i.rpe, 1, 10) ?? 5,
        feelingText: i.feeling ?? undefined,
        painZone: i.pain_level ? (i.pain_zone ?? undefined) : undefined,
        painLevel: clampInt(i.pain_level, 0, 10),
        weatherNote: i.weather ?? undefined,
        isExtra: !session,
      })
      const alerts = newAlerts(before, await currentAlerts(ctx.profile, ctx.today))
      const pain = i.pain_level ? `, molestia ${(i.pain_zone ?? '').toLowerCase()} ${i.pain_level}/10` : ''
      ctx.actions.push({
        kind: 'workout',
        summary: `Entreno de ${SPORT_LABEL[i.sport].toLowerCase()} ${Math.round(i.duration_min)}', RPE ${i.rpe}${pain}${session ? '' : ' (extra)'}`,
        undo: { table: 'workoutLogs', ids: [id], sessionId: session?.id },
        alerts,
      })
      return json({ guardado: true, vinculado_a_sesion: session ? session.title : null, alertas_nuevas: alerts })
    },
  })

  const logSkipTool = betaZodTool({
    name: 'log_skip',
    description: 'Marca como no hecha una sesión del plan, con el motivo. Si no sabes el id, da la fecha y el deporte.',
    inputSchema: z.object({
      plan_session_id: z.number().nullable(),
      date: z.string().nullable(),
      sport: z.enum(SPORTS).nullable(),
      reason_category: z.enum(['cansancio', 'trabajo', 'enfermedad', 'lesion', 'otro']),
      reason_text: z.string().nullable(),
    }),
    run: async (i) => {
      let s = i.plan_session_id ? await db.planSessions.get(i.plan_session_id) : undefined
      if (!s) {
        const date = resolveDate(ctx, i.date)
        s = await db.planSessions.where('date').equals(date).filter((x) => x.status === 'planned' && (!i.sport || x.sport === i.sport)).first()
      }
      if (!s) throw new ToolInputError('No encuentro esa sesión pendiente. Usa get_plan para ver los ids.')
      if (s.status !== 'planned') throw new ToolInputError('Esa sesión ya está registrada.')
      await logSkip(s, i.reason_category, i.reason_text ?? undefined)
      ctx.actions.push({ kind: 'skip', summary: `No hecha: ${s.title} (${i.reason_category})`, undo: { table: 'skipLogs', sessionId: s.id } })
      return json({ guardado: true, sesion: s.title })
    },
  })

  const logMeal = betaZodTool({
    name: 'log_meal',
    description: 'Guarda una comida contada por texto o voz, con macros estimados por alimento. Usa tablas españolas (BEDCA) e incluye el aceite razonable.',
    inputSchema: z.object({
      date: z.string().nullable(),
      meal_type: z.enum(['desayuno', 'comida', 'cena', 'snack', 'entreno']),
      items: z.array(
        z.object({
          name: z.string(),
          grams: z.number().nullable(),
          kcal: z.number(),
          protein_g: z.number(),
          carbs_g: z.number(),
          fat_g: z.number(),
          fiber_g: z.number().nullable(),
        }),
      ),
      confidence: z.number().describe('0-1'),
    }),
    run: async (i) => {
      const date = resolveDate(ctx, i.date)
      if (!i.items.length) throw new ToolInputError('No hay alimentos.')
      const groupId = `coach-${Date.now()}`
      const meals: Omit<MealLog, 'id'>[] = i.items.map((it) => ({
        date,
        mealType: i.meal_type,
        name: it.name,
        grams: it.grams ?? undefined,
        kcal: Math.max(0, Math.round(it.kcal)),
        protein: Math.max(0, it.protein_g),
        carbs: Math.max(0, it.carbs_g),
        fat: Math.max(0, it.fat_g),
        fiber: it.fiber_g ?? undefined,
        source: 'text',
        dataSource: 'ai',
        groupId,
        confidence: Math.min(1, Math.max(0, i.confidence)),
      }))
      const ids = await addMeals(meals)
      const kcal = meals.reduce((a, m) => a + m.kcal, 0)
      ctx.actions.push({ kind: 'meal', summary: `${capital(i.meal_type)}: ${i.items.map((x) => x.name).join(', ')} · ${kcal} kcal`, undo: { table: 'mealLogs', ids } })
      return json({ guardado: true, kcal })
    },
  })

  const getProgress = betaZodTool({
    name: 'get_progress',
    description: 'Resumen de las últimas N semanas (1-8): plan vs realizado, volumen, RPE, peso, comida, check-ins, dolor y alertas del freno de ambición.',
    inputSchema: z.object({ weeks: z.number().describe('1-8') }),
    run: async (i) => json(await progressSummary(ctx, clampInt(i.weeks, 1, 8) ?? 2)),
  })

  const getPlan = betaZodTool({
    name: 'get_plan',
    description: 'Sesiones del plan entre dos fechas (máx. 21 días), con id, estado, duración y descripción.',
    inputSchema: z.object({ from_date: z.string(), to_date: z.string() }),
    run: async (i) => {
      if (!ISO.test(i.from_date) || !ISO.test(i.to_date)) throw new ToolInputError('Fechas en formato YYYY-MM-DD.')
      const to = diffDays(i.to_date, i.from_date) > 21 ? addDays(i.from_date, 21) : i.to_date
      const sessions = await db.planSessions.where('date').between(i.from_date, to, true, true).sortBy('date')
      return json(
        sessions.map((s) => ({
          id: s.id,
          fecha: s.date,
          semana: s.weekNumber,
          deporte: s.sport,
          titulo: s.title,
          duracion: fmtMin(s.durationMin),
          rpe_objetivo: s.intensityRpe,
          estado: s.status,
          opcional: !!s.optional,
          descripcion: s.description,
        })),
      )
    },
  })

  const proposePlanChange = betaZodTool({
    name: 'propose_plan_change',
    description:
      'Propone un cambio del plan que el atleta aceptará o rechazará en la app. No cambia nada por sí solo. Tipos: move (session_id + new_date), modify (session_id + nueva duración/título/descripción), remove (session_id: pasa a opcional), reduce_week (week + percent), repeat_week (week: se repite en la siguiente).',
    inputSchema: z.object({
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
    run: async (i) => {
      if (i.new_date && !ISO.test(i.new_date)) throw new ToolInputError('new_date en formato YYYY-MM-DD.')
      const p = await createProposal({
        kind: i.change,
        sessionId: i.session_id ?? undefined,
        newDate: i.new_date ?? undefined,
        newDurationMin: i.new_duration_min ? Math.round(i.new_duration_min) : undefined,
        newTitle: i.new_title ?? undefined,
        newDescription: i.new_description ?? undefined,
        week: i.week ?? undefined,
        percent: i.percent ?? undefined,
        reason: i.reason,
      })
      ctx.actions.push({ kind: 'proposal', summary: p.summary, proposalId: p.id })
      return json({ propuesta_creada: p.summary, estado: 'pendiente de que el atleta la acepte en la app' })
    },
  })

  const evaluateMilestones = betaZodTool({
    name: 'evaluate_milestones',
    description: 'Hitos del plan (H0-H6 y carrera) con su semana, fecha y criterios, y los resultados de las pruebas de control registradas.',
    inputSchema: z.object({}),
    run: async () => {
      const planStart = planStartFor(ctx.profile)
      const week = weekNumberFor(planStart, ctx.today)
      const tests = await db.testResults.toArray()
      return json({
        semana_actual: week,
        hitos: MILESTONES.map((m) => ({ ...m, fecha: m.week ? weekStart(planStart, m.week) : null, chequeo_medico_hecho: m.key === 'H0' ? ctx.profile.medicalCheckDone : undefined })),
        pruebas: tests,
        nota: 'El estado adelantado/en camino/retrasado se calculará por reglas en una fase posterior; valora con get_progress.',
      })
    },
  })

  const reportAlarm = betaZodTool({
    name: 'report_alarm_signal',
    description:
      'Llama a esta herramienta si el atleta describe una señal de alarma: dolor en el pecho, mareo, desmayo, palpitaciones raras, falta de aire anormal o dolor de cabeza intenso tras el esfuerzo. Activa un aviso fijo en la app.',
    inputSchema: z.object({ symptoms: z.array(z.string()), quote: z.string() }),
    run: async (i) => {
      await raiseAlarm(i.symptoms, i.quote)
      ctx.actions.push({ kind: 'alarm', summary: `Aviso de alarma activado: ${i.symptoms.join(', ')}` })
      return json({ aviso_activado: true })
    },
  })

  return [logCheckin, logWorkoutTool, logSkipTool, logMeal, getProgress, getPlan, proposePlanChange, evaluateMilestones, reportAlarm]
}

export type CoachTools = ReturnType<typeof makeTools>

/** Ejecuta una llamada a herramienta validando la entrada con zod. */
export async function runTool(tools: CoachTools, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const tool = tools.find((t) => t.name.toLowerCase() === name.toLowerCase())
  if (!tool) return { content: `No existe la herramienta ${name}. Disponibles: ${tools.map((t) => t.name).join(', ')}`, isError: true }
  try {
    const parsed = tool.parse(input as never)
    const out = await tool.run(parsed as never)
    return { content: typeof out === 'string' ? out : JSON.stringify(out), isError: false }
  } catch (e) {
    const msg = e instanceof z.ZodError ? `Entrada no válida: ${e.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}` : e instanceof ToolInputError || e instanceof ProposalError ? e.message : `Error: ${(e as Error).message}`
    return { content: msg, isError: true }
  }
}

// ---------- resumen de progreso ----------

export async function progressSummary(ctx: Pick<ToolContext, 'profile' | 'today'>, weeks: number) {
  const { profile, today } = ctx
  const planStart = planStartFor(profile)
  const current = weekNumberFor(planStart, today) ?? 1
  const out = []
  for (let w = current; w > Math.max(0, current - weeks); w--) {
    const start = weekStart(planStart, w)
    const end = addDays(start, 6)
    const [sessions, logs] = await Promise.all([
      db.planSessions.where('weekNumber').equals(w).toArray(),
      db.workoutLogs.where('date').between(start, end, true, true).toArray(),
    ])
    const req = sessions.filter((s) => !s.optional && s.sport !== 'race' && s.date <= today)
    const doneMin = logs.reduce((a, l) => a + l.durationMin, 0)
    out.push({
      semana: w,
      fase: PHASE_LABEL[phaseForWeek(w)],
      sesiones_hasta_hoy: req.length,
      hechas: req.filter((s) => s.status === 'done').length,
      no_hechas: req.filter((s) => s.status === 'skipped').length,
      min_planificados: weekLoadMin(sessions),
      min_realizados: doneMin,
      rpe_medio: logs.length ? Math.round((logs.reduce((a, l) => a + l.rpe, 0) / logs.length) * 10) / 10 : null,
      extras: logs.filter((l) => l.isExtra).length,
    })
  }
  const from14 = addDays(today, -14)
  const [weights, checkins, meals, logs14] = await Promise.all([
    db.bodyLogs.where('date').between(addDays(today, -28), today, true, true).sortBy('date'),
    db.checkins.where('date').between(addDays(today, -7), today, true, true).toArray(),
    db.mealLogs.where('date').between(addDays(today, -7), addDays(today, -1), true, true).toArray(),
    db.workoutLogs.where('date').between(from14, today, true, true).toArray(),
  ])
  const avg = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => x != null)
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
  }
  const days = [...new Set(meals.map((m) => m.date))]
  const [targets, adjustment, alerts, alarm] = await Promise.all([targetsFor(profile, today), getAdjustment(), currentAlerts(profile, today), getAlarm()])
  return {
    hoy: today,
    semana_actual: current,
    semanas: out,
    peso: {
      inicial: profile.startWeightKg,
      objetivo: profile.goalWeightKg,
      registros_28_dias: weights.map((w) => `${w.date}: ${w.weightKg}`),
    },
    comida_7_dias: days.length
      ? {
          dias_con_registro: days.length,
          kcal_media: Math.round(meals.reduce((a, m) => a + m.kcal, 0) / days.length),
          proteina_media_g: Math.round(meals.reduce((a, m) => a + m.protein, 0) / days.length),
        }
      : 'sin registros',
    objetivo_hoy: { kcal: targets.kcal, proteina_g: targets.proteinG, hidratos_g: targets.carbsG, grasa_g: targets.fatG, tipo_dia: targets.dayType, ajuste_semanal_kcal: adjustment.kcal },
    checkins_7_dias: { sueno_h: avg(checkins.map((c) => c.sleepHours)), energia: avg(checkins.map((c) => c.energy)), animo: avg(checkins.map((c) => c.mood)) },
    dolor_14_dias: [
      ...checkins.filter((c) => c.painLevel).map((c) => `${c.date} ${c.painZone} ${c.painLevel}/10`),
      ...logs14.filter((l) => l.painLevel).map((l) => `${l.date} ${l.painZone} ${l.painLevel}/10 (entreno)`),
    ],
    alertas_freno_ambicion: alerts,
    aviso_alarma_activo: alarm ? alarm.symptoms : null,
    semana_empieza: mondayOf(today),
  }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)


import { addDays, formatDayLong, weekNumberFor } from '../domain/dates'
import { fmtMin, weekLoadMin } from '../domain/plan/generator'
import { db, type PlanProposal, type PlanSession } from './db'
import { moveSession, planStartFor } from './plan'

// Propuestas de cambio del plan: el coach las crea, el usuario las acepta o no.
// Nunca se toca el plan sin su confirmación (spec §4.6 y §8.2 regla 7).

export type ProposalInput = Omit<PlanProposal, 'id' | 'createdAt' | 'status' | 'summary' | 'decidedAt'>

export class ProposalError extends Error {}

/** Valida la propuesta contra el plan y genera un resumen legible. */
export async function describeProposal(p: ProposalInput): Promise<string> {
  const s = p.sessionId ? await db.planSessions.get(p.sessionId) : undefined
  const needSession = p.kind === 'move' || p.kind === 'modify' || p.kind === 'remove'
  if (needSession && !s) throw new ProposalError(`No existe la sesión ${p.sessionId}. Usa get_plan para ver los ids.`)
  if (needSession && s!.status !== 'planned') throw new ProposalError('Esa sesión ya está hecha o marcada como no hecha.')
  switch (p.kind) {
    case 'move':
      if (!p.newDate) throw new ProposalError('Falta new_date.')
      return `Mover «${s!.title}» del ${formatDayLong(s!.date)} al ${formatDayLong(p.newDate)}`
    case 'modify': {
      const parts = [
        p.newTitle && `«${p.newTitle}»`,
        p.newDurationMin && `${fmtMin(s!.durationMin)} → ${fmtMin(p.newDurationMin)}`,
        p.newDescription && 'nueva descripción',
      ].filter(Boolean)
      if (!parts.length) throw new ProposalError('No hay cambios en la propuesta.')
      return `Cambiar «${s!.title}» (${formatDayLong(s!.date)}): ${parts.join(', ')}`
    }
    case 'remove':
      return `Quitar «${s!.title}» del ${formatDayLong(s!.date)} (pasa a opcional)`
    case 'reduce_week': {
      if (!p.week || !p.percent || p.percent <= 0 || p.percent >= 80) throw new ProposalError('reduce_week necesita week y percent entre 1 y 79.')
      return `Bajar un ${p.percent} % el volumen de la semana ${p.week}`
    }
    case 'repeat_week':
      if (!p.week || p.week >= 51) throw new ProposalError('repeat_week necesita una semana entre 1 y 50.')
      return `Repetir la semana ${p.week} en la semana ${p.week + 1} en lugar de progresar`
  }
}

export async function createProposal(p: ProposalInput): Promise<PlanProposal> {
  const summary = await describeProposal(p)
  const row: PlanProposal = { ...p, summary, status: 'pending', createdAt: new Date().toISOString() }
  row.id = await db.planProposals.add(row)
  return row
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)

export async function acceptProposal(id: number) {
  const p = await db.planProposals.get(id)
  if (!p || p.status !== 'pending') return
  const profile = await db.profile.toCollection().first()
  if (!profile) return
  const planStart = planStartFor(profile)

  await db.transaction('rw', db.planSessions, db.planProposals, async () => {
    const s = p.sessionId ? await db.planSessions.get(p.sessionId) : undefined
    switch (p.kind) {
      case 'move':
        if (s && p.newDate) await moveSession(s, p.newDate, planStart)
        break
      case 'modify':
        if (s)
          await db.planSessions.update(s.id!, {
            ...(p.newTitle ? { title: p.newTitle } : {}),
            ...(p.newDurationMin ? { durationMin: p.newDurationMin, distanceM: s.distanceM ? Math.round((s.distanceM * p.newDurationMin) / s.durationMin) : undefined } : {}),
            ...(p.newDescription ? { description: p.newDescription } : {}),
          })
        break
      case 'remove':
        if (s) await db.planSessions.update(s.id!, { optional: true, title: `${s.title} (opcional)` })
        break
      case 'reduce_week': {
        const f = 1 - p.percent! / 100
        const sessions = await db.planSessions.where('weekNumber').equals(p.week!).filter((x) => x.status === 'planned').toArray()
        for (const x of sessions) {
          if (x.sport === 'race') continue
          await db.planSessions.update(x.id!, {
            durationMin: round5(x.durationMin * f),
            distanceM: x.distanceM ? Math.round((x.distanceM * f) / 50) * 50 : undefined,
          })
        }
        break
      }
      case 'repeat_week': {
        const src = await db.planSessions.where('weekNumber').equals(p.week!).toArray()
        const target = await db.planSessions.where('weekNumber').equals(p.week! + 1).toArray()
        await db.planSessions.bulkDelete(target.filter((x) => x.status === 'planned').map((x) => x.id!))
        const keep = new Set(target.filter((x) => x.status !== 'planned').map((x) => `${x.date}|${x.sport}`))
        const copies: PlanSession[] = src
          .map(({ id: _id, status: _st, movedFromDate: _m, ...x }) => ({ ...x, date: addDays(x.date, 7), weekNumber: p.week! + 1, status: 'planned' as const }))
          .filter((x) => !keep.has(`${x.date}|${x.sport}`) && weekNumberFor(planStart, x.date) === p.week! + 1)
        await db.planSessions.bulkAdd(copies)
        break
      }
    }
    await db.planProposals.update(id, { status: 'accepted', decidedAt: new Date().toISOString() })
  })
}

export async function rejectProposal(id: number) {
  await db.planProposals.update(id, { status: 'rejected', decidedAt: new Date().toISOString() })
}

/** Minutos de carga de una semana tras aplicar cambios (para mostrar el efecto). */
export async function weekMinutes(week: number) {
  return weekLoadMin(await db.planSessions.where('weekNumber').equals(week).toArray())
}

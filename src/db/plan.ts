import { planStartFromRace, todayISO, weekdayIndex, weekNumberFor, type ISODate } from '../domain/dates'
import { generatePlan } from '../domain/plan/generator'
import { db, type PlanSession, type Profile, type SkipReason, type WorkoutLog } from './db'

export function planStartFor(profile: Pick<Profile, 'raceDate'>): ISODate {
  return planStartFromRace(profile.raceDate)
}

/**
 * (Re)genera el plan desde `fromWeek`. Conserva las sesiones ya hechas o
 * marcadas como no hechas; sustituye las pendientes.
 */
export async function regeneratePlan(profile: Profile, fromWeek = 1) {
  const planStart = planStartFor(profile)
  const weeks = generatePlan({
    planStart,
    maxWeeklyHours: profile.weeklyHoursAvailable,
    raceWeekday: weekdayIndex(profile.raceDate),
    raceName: profile.raceName,
    availableDays: profile.availableDays,
  }).filter((w) => w.weekNumber >= fromWeek)

  await db.transaction('rw', db.planWeeks, db.planSessions, async () => {
    await db.planWeeks.where('weekNumber').aboveOrEqual(fromWeek).delete()
    const existing = await db.planSessions.where('weekNumber').aboveOrEqual(fromWeek).toArray()
    const kept = existing.filter((s) => s.status === 'done' || s.status === 'skipped')
    await db.planSessions.bulkDelete(existing.filter((s) => !kept.includes(s)).map((s) => s.id!))

    // Si cambió la fecha de la carrera, la numeración de semanas se desplaza
    for (const s of kept) {
      const wn = weekNumberFor(planStart, s.date)
      if (wn && wn !== s.weekNumber) await db.planSessions.update(s.id!, { weekNumber: wn })
    }

    const keptKey = new Set(kept.map((s) => `${s.date}|${s.sport}`))
    await db.planWeeks.bulkAdd(weeks.map(({ sessions: _s, ...w }) => w))
    await db.planSessions.bulkAdd(
      weeks.flatMap((w) =>
        w.sessions
          .filter((s) => !keptKey.has(`${s.date}|${s.sport}`))
          .map((s) => ({ ...s, weekNumber: w.weekNumber, status: 'planned' as const })),
      ),
    )
  })
}

export async function moveSession(session: PlanSession, toDate: ISODate, planStart: ISODate) {
  const weekNumber = weekNumberFor(planStart, toDate) ?? session.weekNumber
  await db.planSessions.update(session.id!, {
    date: toDate,
    weekNumber,
    movedFromDate: session.movedFromDate ?? session.date,
  })
}

export async function updateSession(id: number, changes: Partial<PlanSession>) {
  await db.planSessions.update(id, changes)
}

export async function logWorkout(log: Omit<WorkoutLog, 'id' | 'createdAt'>): Promise<number> {
  return db.transaction('rw', db.workoutLogs, db.planSessions, async () => {
    const id = await db.workoutLogs.add({ ...log, createdAt: new Date().toISOString() })
    if (log.planSessionId) await db.planSessions.update(log.planSessionId, { status: 'done' })
    return id as number
  })
}

export async function logSkip(session: PlanSession, reasonCategory: SkipReason, reasonText?: string) {
  await db.transaction('rw', db.skipLogs, db.planSessions, async () => {
    await db.skipLogs.add({ planSessionId: session.id!, date: session.date, reasonCategory, reasonText })
    await db.planSessions.update(session.id!, { status: 'skipped' })
  })
}

/** Deshace "hecho" o "no he podido" y vuelve la sesión a pendiente. */
export async function resetSession(session: PlanSession) {
  await db.transaction('rw', db.skipLogs, db.workoutLogs, db.planSessions, async () => {
    await db.skipLogs.where('planSessionId').equals(session.id!).delete()
    await db.workoutLogs.where('planSessionId').equals(session.id!).delete()
    await db.planSessions.update(session.id!, { status: 'planned' })
  })
}

export function currentWeekNumber(profile: Pick<Profile, 'raceDate'>, today = todayISO()): number | null {
  return weekNumberFor(planStartFor(profile), today)
}

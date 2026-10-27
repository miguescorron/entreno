// Fechas de calendario como 'YYYY-MM-DD'. La aritmética se hace en UTC para
// que los cambios de hora no muevan días. "Hoy" se calcula en Europe/Madrid.

export type ISODate = string

export const TZ = 'Europe/Madrid'
export const PLAN_WEEKS = 51

const DAY_MS = 86_400_000

export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}

export function addDays(d: ISODate, n: number): ISODate {
  return toISO(new Date(parseISO(d).getTime() + n * DAY_MS))
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / DAY_MS)
}

/** 0 = lunes … 6 = domingo */
export function weekdayIndex(d: ISODate): number {
  return (parseISO(d).getUTCDay() + 6) % 7
}

export function mondayOf(d: ISODate): ISODate {
  return addDays(d, -weekdayIndex(d))
}

export function todayISO(now: Date = new Date()): ISODate {
  // en-CA da formato YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now)
}

/** El plan termina la semana de la carrera: S1 empieza 50 semanas antes de ese lunes. */
export function planStartFromRace(raceDate: ISODate): ISODate {
  return addDays(mondayOf(raceDate), -7 * (PLAN_WEEKS - 1))
}

export function weekStart(planStart: ISODate, week: number): ISODate {
  return addDays(planStart, 7 * (week - 1))
}

/** Número de semana del plan (1..51) para una fecha, o null si está fuera. */
export function weekNumberFor(planStart: ISODate, d: ISODate): number | null {
  const n = Math.floor(diffDays(d, planStart) / 7) + 1
  return n >= 1 && n <= PLAN_WEEKS ? n : null
}

export const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** dd/mm/aaaa */
export function formatDate(d: ISODate): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

/** "martes 20 oct" */
export function formatDayLong(d: ISODate): string {
  const dt = parseISO(d)
  return `${WEEKDAYS[weekdayIndex(d)]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`
}

/** "20 oct" */
export function formatDayShort(d: ISODate): string {
  const dt = parseISO(d)
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`
}

export function formatMonth(d: ISODate): string {
  const dt = parseISO(d)
  return `${MONTHS_LONG[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`
}

export function ageOn(birthDate: ISODate, on: ISODate): number {
  const b = parseISO(birthDate)
  const o = parseISO(on)
  let age = o.getUTCFullYear() - b.getUTCFullYear()
  if (o.getUTCMonth() < b.getUTCMonth() || (o.getUTCMonth() === b.getUTCMonth() && o.getUTCDate() < b.getUTCDate())) age--
  return age
}

import { addDays, mondayOf, type ISODate } from '../dates'

// Freno de ambición (spec §8.4): reglas en código, no en el modelo.
// Cada alerta lleva una clave estable para poder confirmarla una vez.

export type AlertKey = 'load_jump' | 'hard_streak' | 'extra_doubles' | 'fast_weight_loss' | 'pain_streak' | 'big_deficit' | 'below_bmr'

export interface Alert {
  key: AlertKey
  /** Identificador de la ocurrencia (semana o fecha): confirmar una no silencia las siguientes */
  id: string
  title: string
  message: string
}

export interface WorkoutPoint {
  date: ISODate
  durationMin: number
  rpe: number
  isExtra: boolean
}

export interface PainPoint {
  date: ISODate
  zone: string
  level: number
}

export interface NutritionDay {
  date: ISODate
  intakeKcal: number
  tdee: number
  bmr: number
}

export interface GuardrailInput {
  today: ISODate
  workouts: WorkoutPoint[]
  weights: { date: ISODate; kg: number }[]
  pains: PainPoint[]
  /** Solo días con el registro de comida completo (varias comidas apuntadas) */
  nutrition: NutritionDay[]
}

/** Carga = horas × RPE medio ponderado por duración. */
export function weekLoad(workouts: WorkoutPoint[]): number {
  const min = workouts.reduce((a, w) => a + w.durationMin, 0)
  if (!min) return 0
  const rpe = workouts.reduce((a, w) => a + w.rpe * w.durationMin, 0) / min
  return (min / 60) * rpe
}

export function evaluateAmbition(i: GuardrailInput): Alert[] {
  const alerts: Alert[] = []
  const thisMonday = mondayOf(i.today)
  const prevMonday = addDays(thisMonday, -7)
  const inRange = (d: ISODate, from: ISODate, to: ISODate) => d >= from && d <= to

  // 1. Carga semanal > +10 % respecto a la anterior
  const cur = weekLoad(i.workouts.filter((w) => inRange(w.date, thisMonday, addDays(thisMonday, 6))))
  const prev = weekLoad(i.workouts.filter((w) => inRange(w.date, prevMonday, addDays(prevMonday, 6))))
  if (prev > 0 && cur > prev * 1.1) {
    alerts.push({
      key: 'load_jump',
      id: thisMonday,
      title: 'La carga sube más de un 10 %',
      message: `Llevas ${Math.round((cur / prev - 1) * 100)} % más carga (horas × esfuerzo) que la semana pasada. Subir de golpe es la receta de las lesiones.`,
    })
  }

  // 2. Tres o más días seguidos con RPE ≥ 7
  const hardDays = new Set(i.workouts.filter((w) => w.rpe >= 7).map((w) => w.date))
  for (let k = 0; k < 7; k++) {
    const d = addDays(i.today, -k)
    if (hardDays.has(d) && hardDays.has(addDays(d, -1)) && hardDays.has(addDays(d, -2))) {
      alerts.push({ key: 'hard_streak', id: d, title: '3 días seguidos a tope', message: 'Tres o más días seguidos con esfuerzo ≥ 7/10. Toca un día suave o de descanso.' })
      break
    }
  }

  // 3. Dos dobles sesiones fuera de plan en la semana
  const week = i.workouts.filter((w) => inRange(w.date, thisMonday, addDays(thisMonday, 6)))
  const doubles = [...new Set(week.map((w) => w.date))].filter((d) => {
    const day = week.filter((w) => w.date === d)
    return day.length >= 2 && day.some((w) => w.isExtra)
  })
  if (doubles.length >= 2) {
    alerts.push({ key: 'extra_doubles', id: thisMonday, title: 'Dobles sesiones de más', message: `Esta semana llevas ${doubles.length} dobles sesiones fuera del plan. Más no es mejor: el progreso llega al recuperar.` })
  }

  // 4. Peso bajando > 1,2 % por semana durante 2 semanas
  const avg = (from: ISODate, to: ISODate) => {
    const xs = i.weights.filter((w) => inRange(w.date, from, to)).map((w) => w.kg)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }
  const w0 = avg(addDays(i.today, -6), i.today)
  const w1 = avg(addDays(i.today, -13), addDays(i.today, -7))
  const w2 = avg(addDays(i.today, -20), addDays(i.today, -14))
  if (w0 && w1 && w2 && (w2 - w1) / w2 > 0.012 && (w1 - w0) / w1 > 0.012) {
    alerts.push({ key: 'fast_weight_loss', id: thisMonday, title: 'Pierdes peso demasiado rápido', message: 'Más de un 1,2 % por semana dos semanas seguidas. Come más: perder así se paga en rendimiento y lesiones.' })
  }

  // 5. Dolor ≥ 4/10 en la misma zona 3 días seguidos
  const pain = new Map<string, Set<ISODate>>()
  for (const p of i.pains) {
    if (p.level < 4) continue
    const z = p.zone.toLowerCase()
    if (!pain.has(z)) pain.set(z, new Set())
    pain.get(z)!.add(p.date)
  }
  for (const [zone, dates] of pain) {
    const hit = [...dates].find((d) => dates.has(addDays(d, -1)) && dates.has(addDays(d, -2)) && d >= addDays(i.today, -6))
    if (hit) {
      alerts.push({
        key: 'pain_streak',
        id: `${zone}-${hit}`,
        title: `Dolor persistente: ${zone}`,
        message: 'Dolor ≥ 4/10 tres días seguidos en la misma zona. Reduce o sustituye las sesiones que la carguen y pide valoración a un profesional.',
      })
    }
  }

  // 6. Déficit > 700 kcal/día o ingesta por debajo del basal
  for (const n of i.nutrition.filter((x) => x.date < i.today && x.date >= addDays(i.today, -3))) {
    if (n.intakeKcal < n.bmr) {
      alerts.push({ key: 'below_bmr', id: n.date, title: 'Comiste por debajo del basal', message: `El ${n.date.slice(8)}/${n.date.slice(5, 7)} registraste ${n.intakeKcal} kcal, menos que tu metabolismo basal (${n.bmr}). Nunca bajes de ahí.` })
    } else if (n.tdee - n.intakeKcal > 700) {
      alerts.push({ key: 'big_deficit', id: n.date, title: 'Déficit demasiado grande', message: `El ${n.date.slice(8)}/${n.date.slice(5, 7)} el déficit fue de ${n.tdee - n.intakeKcal} kcal. El máximo razonable es 500.` })
    }
  }

  return alerts
}

export const alertId = (a: Alert) => `${a.key}:${a.id}`

// ---------- señales de alarma (spec §8.2 punto 4 y §13) ----------

const ALARM_PATTERNS: [RegExp, string][] = [
  [/dolor (en el|de|del) pecho|dolor torácico|opresi[oó]n (en el )?pecho/i, 'dolor en el pecho'],
  [/\bmare(o|é|ado|ada|arme|aba|ando)(?![a-záéíóúñ])/i, 'mareo'],
  [/desmay|perd[ií] el conocimiento|me desvanec/i, 'desmayo'],
  [/palpitaci|el coraz[oó]n (me )?(iba|va) (a mil|loco|raro)|arritmia/i, 'palpitaciones'],
  [/falta de aire|me ahogaba|me ahogo|no pod[ií]a respirar/i, 'falta de aire'],
  [/dolor de cabeza (muy )?(fuerte|intenso|brutal)|cefalea intensa/i, 'dolor de cabeza intenso'],
]

/** Detecta en texto libre síntomas que obligan a parar y consultar. */
export function detectAlarmSignals(text: string): string[] {
  return ALARM_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label)
}

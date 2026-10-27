import type { Profile } from '../../db/db'
import { addDays, mondayOf, todayISO, WEEKDAYS_SHORT, weekdayIndex } from '../../domain/dates'
import { DISTANCE_LABEL, EQUIPMENT_LABEL, FOCUS_LABEL, isEventGoal, LEVEL_LABEL, type Goal, type GoalType, type HomeEquipment, type Level, type RunDistance, type StrengthFocus } from '../../domain/goals'
import { Pressable } from '../../ui/Button'
import { Chips, Field, NumberInput, Segmented, Switch } from '../../ui/Controls'
import { Icon } from '../../ui/Icon'

export type ProfileDraft = Omit<Profile, 'id' | 'createdAt'>

export const DEFAULT_PROFILE: ProfileDraft = {
  name: '',
  sex: 'male',
  birthDate: '',
  heightCm: 0,
  startWeightKg: 0,
  goalWeightKg: 0,
  raceName: '',
  raceDate: '',
  weeklyHoursAvailable: 6,
  level: 'beginner',
  equipment: 'dumbbells',
  sessionMinutes: 45,
  availableDays: [0, 1, 2, 3, 5, 6],
  preferredTime: 'temprano',
  swimCrawl: 'basic',
  swimContinuousM: 50,
  poolNearby: true,
  bikeType: 'road',
  hasHelmet: true,
  hasTrainer: false,
  device: 'none',
  injuriesNotes: '',
  medicalCheckDone: false,
  allergies: '',
  dietNotes: '',
  mealTimes: '',
}

export type SectionKey = 'goal' | 'basics' | 'swim' | 'gear' | 'availability' | 'health' | 'food'

export const SECTIONS: { key: SectionKey; title: string; lead: string }[] = [
  { key: 'goal', title: 'Tu objetivo', lead: 'Todo el plan se adapta a lo que quieres conseguir y a cómo empiezas.' },
  { key: 'basics', title: 'Sobre ti', lead: 'Lo necesito para calcular tu gasto y tus objetivos.' },
  { key: 'swim', title: 'Natación', lead: 'La técnica manda en las primeras semanas.' },
  { key: 'gear', title: 'Bici y material', lead: 'Para adaptar las sesiones a lo que tienes.' },
  { key: 'availability', title: 'Tu tiempo', lead: 'El plan se ajusta a lo que de verdad puedes hacer.' },
  { key: 'health', title: 'Salud', lead: 'Lo primero es entrenar sin lesionarse.' },
  { key: 'food', title: 'Alimentación', lead: 'Para el módulo de comida y las ideas de platos.' },
]

/** Secciones que aplican a este objetivo (natación y bici solo para triatlón). */
export function sectionsFor(p: Pick<ProfileDraft, 'goal'>) {
  const tri = p.goal?.type === 'triathlon'
  return SECTIONS.filter((s) => tri || (s.key !== 'swim' && s.key !== 'gear'))
}

/** Lunes en que empieza un plan nuevo: esta semana si es lunes-miércoles; si no, la siguiente. */
export function planStartMonday(today = todayISO()) {
  return weekdayIndex(today) <= 2 ? mondayOf(today) : addDays(mondayOf(today), 7)
}

const GOALS: { type: GoalType; title: string; desc: string }[] = [
  { type: 'strength', title: 'Fuerza y tono', desc: 'Tonificar, ganar fuerza o ganar músculo, en casa o en el gimnasio.' },
  { type: 'weight_loss', title: 'Perder peso', desc: 'Perder grasa sin perder músculo: fuerza, cardio y alimentación.' },
  { type: 'running', title: 'Carrera a pie', desc: '5 km, 10 km, media maratón o maratón con fecha.' },
  { type: 'hyrox', title: 'Hyrox', desc: 'Carrera y estaciones funcionales para una competición.' },
  { type: 'triathlon', title: 'Triatlón', desc: 'Medio Ironman (70.3) con un plan de un año.' },
]

function defaultGoal(type: GoalType, prev?: Goal): Goal {
  const keep = { eventName: prev?.eventName, eventDate: prev?.eventDate }
  switch (type) {
    case 'strength':
      return { type, focus: 'tone' }
    case 'weight_loss':
      return { type }
    case 'running':
      return { type, distance: '10k', ...keep }
    case 'hyrox':
      return { type, division: 'open', ...keep }
    case 'triathlon':
      return { type, distance: '70.3', ...keep }
  }
}

function GoalSection({ p, onChange }: { p: ProfileDraft; onChange: (patch: Partial<ProfileDraft>) => void }) {
  const goal = p.goal
  const setGoal = (g: Goal) => onChange(g.type === 'triathlon' ? { goal: g, raceName: g.eventName ?? '', raceDate: g.eventDate ?? '' } : { goal: g })
  return (
    <div className="stack-lg">
      <div className="group">
        {GOALS.map((g) => {
          const on = goal?.type === g.type
          return (
            <Pressable key={g.type} className="cell" onClick={() => setGoal(on ? goal! : defaultGoal(g.type, goal))} aria-pressed={on}>
              <span className="grow">
                <span className="t-headline" style={{ display: 'block' }}>{g.title}</span>
                <span className="t-foot muted">{g.desc}</span>
              </span>
              <span className="sport-badge" style={{ width: 26, height: 26, borderRadius: 13, background: on ? 'var(--tint)' : 'var(--fill)' }} aria-hidden>
                {on && <Icon name="check" size={16} strokeWidth={2.6} />}
              </span>
            </Pressable>
          )
        })}
      </div>

      {goal?.type === 'strength' && (
        <Field label="¿Qué buscas?">
          <Chips value={goal.focus ?? 'tone'} onChange={(focus) => setGoal({ ...goal, focus: focus as StrengthFocus })} options={(Object.keys(FOCUS_LABEL) as StrengthFocus[]).map((v) => ({ value: v, label: FOCUS_LABEL[v] }))} />
        </Field>
      )}
      {goal?.type === 'running' && (
        <Field label="Distancia">
          <Chips value={goal.distance ?? '10k'} onChange={(d) => setGoal({ ...goal, distance: d as RunDistance })} options={(['5k', '10k', 'half', 'marathon'] as RunDistance[]).map((v) => ({ value: v, label: DISTANCE_LABEL[v] }))} />
        </Field>
      )}
      {goal?.type === 'hyrox' && (
        <Field label="Categoría">
          <Segmented value={goal.division ?? 'open'} onChange={(division) => setGoal({ ...goal, division })} options={[{ value: 'open', label: 'Open' }, { value: 'pro', label: 'Pro' }, { value: 'doubles', label: 'Dobles' }]} />
        </Field>
      )}
      {goal && isEventGoal(goal) && (
        <>
          <Field label={goal.type === 'triathlon' ? 'Prueba' : 'Nombre de la prueba (opcional)'}>
            <input className="input" value={goal.eventName ?? ''} placeholder={goal.type === 'hyrox' ? 'Hyrox Madrid' : goal.type === 'running' ? 'Media Maratón de Sevilla' : 'ICAN Gandía 70.3'} onChange={(e) => setGoal({ ...goal, eventName: e.target.value })} />
          </Field>
          <Field label="Fecha de la prueba" hint={goal.type === 'triathlon' ? 'El plan del 70.3 dura 51 semanas y cuenta hacia atrás desde esta fecha.' : 'El plan va desde la semana que viene hasta esta fecha.'}>
            <input className="input" type="date" min={todayISO()} value={goal.eventDate ?? ''} onChange={(e) => setGoal({ ...goal, eventDate: e.target.value })} />
          </Field>
        </>
      )}

      {goal && (
        <>
          <Field label="¿Cómo empiezas?">
            <Chips value={p.level ?? 'beginner'} onChange={(level) => onChange({ level: level as Level })} options={(Object.keys(LEVEL_LABEL) as Level[]).map((v) => ({ value: v, label: LEVEL_LABEL[v] }))} />
          </Field>
          <Field label="¿Dónde entrenas la fuerza?">
            <Chips value={p.equipment ?? 'dumbbells'} onChange={(equipment) => onChange({ equipment: equipment as HomeEquipment })} options={(Object.keys(EQUIPMENT_LABEL) as HomeEquipment[]).map((v) => ({ value: v, label: EQUIPMENT_LABEL[v] }))} />
          </Field>
        </>
      )}
    </div>
  )
}

interface Props {
  section: SectionKey
  value: ProfileDraft
  onChange: (patch: Partial<ProfileDraft>) => void
}

export function ProfileSection({ section, value: p, onChange }: Props) {
  switch (section) {
    case 'basics':
      return (
        <div className="stack-lg">
          <Field label="Nombre">
            <input className="input" value={p.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <Field label="Sexo" hint="Para la fórmula del metabolismo basal (Mifflin-St Jeor).">
            <Segmented value={p.sex} onChange={(sex) => onChange({ sex })} options={[{ value: 'male', label: 'Hombre' }, { value: 'female', label: 'Mujer' }]} />
          </Field>
          <Field label="Fecha de nacimiento">
            <input className="input" type="date" value={p.birthDate} onChange={(e) => onChange({ birthDate: e.target.value })} />
          </Field>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <Field label="Altura">
                <NumberInput value={p.heightCm || undefined} onChange={(v) => onChange({ heightCm: v ?? 0 })} suffix="cm" />
              </Field>
            </div>
            <div className="grow">
              <Field label="Peso actual">
                <NumberInput value={p.startWeightKg || undefined} onChange={(v) => onChange({ startWeightKg: v ?? 0 })} suffix="kg" />
              </Field>
            </div>
          </div>
          <Field label="Peso objetivo" hint="Orientativo. Nunca a costa del rendimiento ni de la salud.">
            <NumberInput value={p.goalWeightKg || undefined} onChange={(v) => onChange({ goalWeightKg: v ?? 0 })} suffix="kg" />
          </Field>
        </div>
      )
    case 'swim':
      return (
        <div className="stack-lg">
          <Field label="¿Sabes nadar crol?">
            <Segmented
              value={p.swimCrawl}
              onChange={(swimCrawl) => onChange({ swimCrawl })}
              options={[
                { value: 'no', label: 'No' },
                { value: 'basic', label: 'Algo' },
                { value: 'good', label: 'Bien' },
              ]}
            />
          </Field>
          <Field label="Metros seguidos que nadas hoy">
            <NumberInput value={p.swimContinuousM} onChange={(v) => onChange({ swimContinuousM: v ?? 0 })} suffix="m" step="25" />
          </Field>
          <div className="group">
            <div className="cell">
              <span className="grow t-body">Tengo piscina cerca</span>
              <Switch label="Piscina cerca" checked={p.poolNearby} onChange={(poolNearby) => onChange({ poolNearby })} />
            </div>
          </div>
          {p.swimCrawl !== 'good' && (
            <div className="banner">
              <span>🏊</span>
              <span className="t-sub">Te recomiendo clases o un club desde la semana 1: la técnica ahorra muchos minutos y lesiones de hombro.</span>
            </div>
          )}
        </div>
      )
    case 'gear':
      return (
        <div className="stack-lg">
          <Field label="Bici">
            <Chips
              value={p.bikeType}
              onChange={(bikeType) => onChange({ bikeType })}
              options={[
                { value: 'road', label: 'Carretera' },
                { value: 'gravel', label: 'Gravel' },
                { value: 'mtb', label: 'MTB' },
                { value: 'other', label: 'Otra' },
                { value: 'none', label: 'No tengo' },
              ]}
            />
          </Field>
          <div className="group">
            <div className="cell">
              <span className="grow t-body">Casco</span>
              <Switch label="Casco" checked={p.hasHelmet} onChange={(hasHelmet) => onChange({ hasHelmet })} />
            </div>
            <div className="cell">
              <span className="grow t-body">Rodillo en casa</span>
              <Switch label="Rodillo" checked={p.hasTrainer} onChange={(hasTrainer) => onChange({ hasTrainer })} />
            </div>
          </div>
          <Field label="Reloj o pulsómetro">
            <Chips
              value={p.device}
              onChange={(device) => onChange({ device })}
              options={[
                { value: 'apple_watch', label: 'Apple Watch' },
                { value: 'garmin', label: 'Garmin' },
                { value: 'other', label: 'Otro' },
                { value: 'none', label: 'Ninguno' },
              ]}
            />
          </Field>
        </div>
      )
    case 'availability':
      return (
        <div className="stack-lg">
          <Field label="Días que puedes entrenar">
            <Chips
              multi
              value={p.availableDays}
              onChange={(d) => onChange({ availableDays: p.availableDays.includes(d) ? p.availableDays.filter((x) => x !== d) : [...p.availableDays, d].sort() })}
              options={WEEKDAYS_SHORT.map((l, i) => ({ value: i, label: l }))}
            />
          </Field>
          <Field label="Minutos por sesión">
            <Chips value={p.sessionMinutes ?? 45} onChange={(sessionMinutes) => onChange({ sessionMinutes })} options={[30, 45, 60, 75].map((v) => ({ value: v, label: `${v} min` }))} />
          </Field>
          {p.goal && p.goal.type !== 'strength' && p.goal.type !== 'weight_loss' && (
          <Field label={`Horas máximas por semana: ${String(p.weeklyHoursAvailable).replace('.', ',')} h`} hint="Si el plan pide más en las semanas fuertes, se recorta en proporción.">
            <input
              className="rpe"
              type="range"
              min={4}
              max={12}
              step={0.5}
              value={p.weeklyHoursAvailable}
              onChange={(e) => onChange({ weeklyHoursAvailable: Number(e.target.value) })}
              aria-label="Horas por semana"
            />
          </Field>
          )}
          <Field label="¿A qué hora entrenas?">
            <Chips
              value={p.preferredTime}
              onChange={(preferredTime) => onChange({ preferredTime })}
              options={[
                { value: 'temprano', label: 'Temprano' },
                { value: 'mediodia', label: 'Mediodía' },
                { value: 'tarde', label: 'Tarde' },
                { value: 'variable', label: 'Variable' },
              ]}
            />
          </Field>
        </div>
      )
    case 'health':
      return (
        <div className="stack-lg">
          <div className="group">
            <div className="cell">
              <span className="grow">
                <div className="t-body">Chequeo médico con prueba de esfuerzo</div>
                <div className="t-foot muted">Muy recomendable si empiezas de cero, tienes más de 35 años o vas a preparar una prueba.</div>
              </span>
              <Switch label="Chequeo médico hecho" checked={p.medicalCheckDone} onChange={(medicalCheckDone) => onChange({ medicalCheckDone })} />
            </div>
          </div>
          <Field label="Lesiones o molestias previas">
            <textarea className="input" value={p.injuriesNotes} placeholder="Ej.: esguince de tobillo derecho en 2019" onChange={(e) => onChange({ injuriesNotes: e.target.value })} />
          </Field>
        </div>
      )
    case 'food':
      return (
        <div className="stack-lg">
          <Field label="Alergias o intolerancias">
            <input className="input" value={p.allergies} placeholder="Ninguna" onChange={(e) => onChange({ allergies: e.target.value })} />
          </Field>
          <Field label="Alimentos que no comes y preferencias">
            <textarea className="input" value={p.dietNotes} onChange={(e) => onChange({ dietNotes: e.target.value })} />
          </Field>
          <Field label="Horarios de comida">
            <input className="input" value={p.mealTimes} placeholder="Ej.: desayuno 8:00, comida 14:30, cena 21:30" onChange={(e) => onChange({ mealTimes: e.target.value })} />
          </Field>
        </div>
      )
    case 'goal':
      return <GoalSection p={p} onChange={onChange} />
  }
}

export function validateSection(section: SectionKey, p: ProfileDraft): string | null {
  if (section === 'basics') {
    if (!p.birthDate) return 'Falta la fecha de nacimiento'
    if (p.heightCm < 120 || p.heightCm > 230) return 'Revisa la altura'
    if (p.startWeightKg < 35 || p.startWeightKg > 250) return 'Revisa el peso'
    if (p.goalWeightKg < 35 || p.goalWeightKg > 250) return 'Revisa el peso objetivo'
  }
  if (section === 'availability' && p.availableDays.length < 3) return 'Elige al menos 3 días'
  if (section === 'goal') {
    if (!p.goal) return 'Elige tu objetivo'
    if (isEventGoal(p.goal)) {
      if (!p.goal.eventDate) return 'Falta la fecha de la prueba'
      if (p.goal.eventDate <= addDays(todayISO(), 13)) return 'La prueba tiene que ser al menos dentro de 2 semanas'
    }
    if (p.goal.type === 'triathlon' && !p.goal.eventName) return 'Pon el nombre de la prueba'
  }
  return null
}

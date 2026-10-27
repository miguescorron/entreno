import type { Profile } from '../../db/db'
import { formatDate, WEEKDAYS_SHORT } from '../../domain/dates'
import { Chips, Field, NumberInput, Segmented, Switch } from '../../ui/Controls'

export type ProfileDraft = Omit<Profile, 'id' | 'createdAt'>

export const DEFAULT_PROFILE: ProfileDraft = {
  name: '',
  sex: 'male',
  birthDate: '',
  heightCm: 0,
  startWeightKg: 0,
  goalWeightKg: 0,
  raceName: 'ICAN Gandía 70.3',
  raceDate: '2027-10-10',
  weeklyHoursAvailable: 10,
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

export type SectionKey = 'basics' | 'swim' | 'gear' | 'availability' | 'health' | 'food' | 'race'

export const SECTIONS: { key: SectionKey; title: string; lead: string }[] = [
  { key: 'basics', title: 'Sobre ti', lead: 'Lo necesito para calcular tu gasto y tus objetivos.' },
  { key: 'swim', title: 'Natación', lead: 'La técnica manda en las primeras semanas.' },
  { key: 'gear', title: 'Material', lead: 'Para adaptar las sesiones a lo que tienes.' },
  { key: 'availability', title: 'Tu tiempo', lead: 'El plan se ajusta a lo que de verdad puedes hacer.' },
  { key: 'health', title: 'Salud', lead: 'Lo primero es llegar sano.' },
  { key: 'food', title: 'Alimentación', lead: 'Para el módulo de comida y el menú semanal.' },
  { key: 'race', title: 'La carrera', lead: 'Todo el plan cuenta hacia atrás desde esta fecha.' },
]

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
          <Field label={`Horas máximas por semana: ${String(p.weeklyHoursAvailable).replace('.', ',')} h`} hint="En los picos el plan pide ~10 h. Si pones menos, se recorta todo en proporción.">
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
                <div className="t-foot muted">Hito H0. Muy recomendable antes de empezar.</div>
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
    case 'race':
      return (
        <div className="stack-lg">
          <Field label="Prueba">
            <input className="input" value={p.raceName} onChange={(e) => onChange({ raceName: e.target.value })} />
          </Field>
          <Field label="Fecha" hint={`Provisional: ${formatDate('2027-10-10')}. Confírmala en la web oficial y cámbiala aquí cuando salga.`}>
            <input className="input" type="date" value={p.raceDate} onChange={(e) => onChange({ raceDate: e.target.value })} />
          </Field>
        </div>
      )
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
  if (section === 'race' && !p.raceDate) return 'Falta la fecha de la carrera'
  return null
}

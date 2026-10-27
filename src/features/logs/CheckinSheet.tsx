import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, type Checkin } from '../../db/db'
import { raiseAlarm } from '../../db/guardrails'
import { detectAlarmSignals } from '../../domain/guardrails/ambition'
import { formatDayLong, type ISODate } from '../../domain/dates'
import { Button } from '../../ui/Button'
import { Chips, Field, NumberInput, Rating } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { PAIN_ZONES } from './WorkoutLogSheet'

export function CheckinSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: ISODate }) {
  const existing = useLiveQuery(() => db.checkins.where('date').equals(date).first(), [date])
  const [c, setC] = useState<Checkin>({ date })
  const [weight, setWeight] = useState<number>()
  const toast = useToast()

  useEffect(() => {
    if (open) {
      setC(existing ?? { date })
      setWeight(undefined)
    }
  }, [open, existing, date])

  const set = (patch: Partial<Checkin>) => setC((x) => ({ ...x, ...patch }))

  const save = async () => {
    await db.transaction('rw', db.checkins, db.bodyLogs, async () => {
      await db.checkins.where('date').equals(date).delete()
      await db.checkins.add({ ...c, id: undefined, date, painZone: c.painLevel ? c.painZone : undefined })
      if (weight) {
        await db.bodyLogs.where('date').equals(date).delete()
        await db.bodyLogs.add({ date, weightKg: weight })
      }
    })
    if (c.freeText) {
      const symptoms = detectAlarmSignals(c.freeText)
      if (symptoms.length) await raiseAlarm(symptoms, c.freeText)
    }
    onClose()
    toast('Check-in guardado')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Check-in"
      left={<Button variant="plain" onClick={onClose}>Cancelar</Button>}
      right={<Button variant="plain" onClick={save} style={{ fontWeight: 600 }}>Guardar</Button>}
    >
      <div className="stack-lg">
        <div className="t-sub muted">{formatDayLong(date)}</div>
        <Field label="Peso (opcional)">
          <NumberInput value={weight} onChange={setWeight} suffix="kg" placeholder="—" />
        </Field>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ width: '38%' }}>
            <Field label="Sueño">
              <NumberInput value={c.sleepHours} onChange={(sleepHours) => set({ sleepHours })} suffix="h" />
            </Field>
          </div>
          <div className="grow">
            <Field label="Calidad">
              <Rating value={c.sleepQuality} onChange={(sleepQuality) => set({ sleepQuality })} />
            </Field>
          </div>
        </div>
        <Field label="Energía">
          <Rating value={c.energy} onChange={(energy) => set({ energy })} />
        </Field>
        <Field label="Ánimo">
          <Rating value={c.mood} onChange={(mood) => set({ mood })} />
        </Field>
        <Field label="Dolor o molestias">
          <Chips value={c.painZone ?? ''} onChange={(z) => set({ painZone: c.painZone === z ? undefined : z, painLevel: c.painZone === z ? undefined : c.painLevel ?? 2 })} options={PAIN_ZONES.map((z) => ({ value: z, label: z }))} />
        </Field>
        {c.painZone && (
          <Field label={`Intensidad: ${c.painLevel ?? 0}/10`}>
            <Rating value={c.painLevel} onChange={(painLevel) => set({ painLevel })} min={1} max={10} />
          </Field>
        )}
        <Field label="Notas">
          <textarea className="input" value={c.freeText ?? ''} placeholder="Cualquier cosa que quieras apuntar" onChange={(e) => set({ freeText: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  )
}

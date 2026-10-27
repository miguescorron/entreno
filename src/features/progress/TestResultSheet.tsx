import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import type { ISODate } from '../../domain/dates'
import { TEST_LABEL, type TestType } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Chips, Field, NumberInput } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

const TYPES = Object.keys(TEST_LABEL) as TestType[]

/** Registrar una prueba de control o una marca personal. */
export function TestResultSheet({ open, onClose, today }: { open: boolean; onClose: () => void; today: ISODate }) {
  const [type, setType] = useState<TestType>('run20')
  const [value, setValue] = useState<number>()
  const [min, setMin] = useState<number>()
  const [sec, setSec] = useState<number>()
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const toast = useToast()

  useEffect(() => {
    if (open) {
      setValue(undefined)
      setMin(undefined)
      setSec(undefined)
      setDate(today)
      setNote('')
    }
  }, [open, today])

  const isTime = type === 'swim400'
  const final = isTime ? (min ?? 0) * 60 + (sec ?? 0) : value

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Prueba o marca"
      left={<Button variant="plain" onClick={onClose}>Cancelar</Button>}
      right={
        <Button
          variant="plain"
          style={{ fontWeight: 600 }}
          disabled={!final}
          onClick={async () => {
            await db.testResults.add({ date, type, value: final!, unit: TEST_LABEL[type].unit, note: note.trim() || undefined })
            onClose()
            toast('Guardado')
          }}
        >
          Guardar
        </Button>
      }
    >
      <div className="stack-lg">
        <Field label="Tipo">
          <Chips value={type} onChange={setType} options={TYPES.map((t) => ({ value: t, label: TEST_LABEL[t].label }))} />
        </Field>
        {isTime ? (
          <Field label="Tiempo">
            <div className="row">
              <div className="grow">
                <NumberInput value={min} onChange={setMin} suffix="min" step="1" />
              </div>
              <div className="grow">
                <NumberInput value={sec} onChange={setSec} suffix="s" step="1" />
              </div>
            </div>
          </Field>
        ) : (
          <Field label={TEST_LABEL[type].hint}>
            <NumberInput value={value} onChange={setValue} suffix={TEST_LABEL[type].unit} />
          </Field>
        )}
        <Field label="Fecha">
          <input className="input" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <Field label="Notas">
          <input className="input" value={note} placeholder="Condiciones, sensaciones…" onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  )
}

import { useEffect, useState } from 'react'
import type { PlanSession, SkipReason } from '../../db/db'
import { logSkip, resetSession } from '../../db/plan'
import { Button } from '../../ui/Button'
import { Chips, Field } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

const REASONS: { value: SkipReason; label: string }[] = [
  { value: 'cansancio', label: 'Cansancio' },
  { value: 'trabajo', label: 'Trabajo' },
  { value: 'enfermedad', label: 'Enfermedad' },
  { value: 'lesion', label: 'Lesión o dolor' },
  { value: 'otro', label: 'Otro' },
]

export function SkipSheet({ open, onClose, session }: { open: boolean; onClose: () => void; session?: PlanSession }) {
  const [reason, setReason] = useState<SkipReason>('trabajo')
  const [text, setText] = useState('')
  const toast = useToast()
  useEffect(() => {
    if (open) {
      setReason('trabajo')
      setText('')
    }
  }, [open])

  const save = async () => {
    if (!session) return
    await logSkip(session, reason, text.trim() || undefined)
    onClose()
    toast('Anotado. Mañana más.', { label: 'Deshacer', run: () => resetSession(session) })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="No he podido"
      left={<Button variant="plain" onClick={onClose}>Cancelar</Button>}
      right={<Button variant="plain" onClick={save} style={{ fontWeight: 600 }}>Guardar</Button>}
    >
      <div className="stack-lg">
        <div className="t-sub muted">{session?.title}</div>
        <Field label="Motivo">
          <Chips value={reason} onChange={setReason} options={REASONS} />
        </Field>
        <Field label="Detalle (opcional)">
          <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {reason === 'lesion' && (
          <div className="banner">
            <span>🩹</span>
            <span className="t-sub">Si el dolor es ≥ 4/10 y dura más de 2 días, o es agudo o articular, para y consulta a un profesional.</span>
          </div>
        )}
        <p className="t-foot muted" style={{ margin: 0 }}>
          Saltarse una sesión no pasa nada. No intentes recuperarla doblando otro día.
        </p>
      </div>
    </Sheet>
  )
}

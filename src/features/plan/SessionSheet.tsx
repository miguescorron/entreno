import { useEffect, useState } from 'react'
import type { PlanSession } from '../../db/db'
import { moveSession, resetSession, updateSession } from '../../db/plan'
import { addDays, formatDayLong, mondayOf, WEEKDAYS_SHORT, type ISODate } from '../../domain/dates'
import { fmtMin } from '../../domain/plan/generator'
import { Button } from '../../ui/Button'
import { Chips, Field, NumberInput } from '../../ui/Controls'
import { Sheet } from '../../ui/Sheet'
import { formatDistance, SportBadge } from '../../ui/sport'
import { useToast } from '../../ui/Toast'

interface Props {
  open: boolean
  onClose: () => void
  session?: PlanSession
  planStart: ISODate
  onLog?: (s: PlanSession) => void
  onSkip?: (s: PlanSession) => void
}

/** Detalle de una sesión: ver, editar duración/descripción y moverla de día. */
export function SessionSheet({ open, onClose, session, planStart, onLog, onSkip }: Props) {
  const [editing, setEditing] = useState(false)
  const [duration, setDuration] = useState<number>()
  const [description, setDescription] = useState('')
  const [date, setDate] = useState<ISODate>('')
  const toast = useToast()

  useEffect(() => {
    if (open && session) {
      setEditing(false)
      setDuration(session.durationMin)
      setDescription(session.description)
      setDate(session.date)
    }
  }, [open, session])

  if (!session) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const monday = mondayOf(session.date)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  const save = async () => {
    const changes: Partial<PlanSession> = {}
    if (duration && duration !== session.durationMin) changes.durationMin = duration
    if (description !== session.description) changes.description = description
    if (Object.keys(changes).length) await updateSession(session.id!, changes)
    if (date !== session.date) {
      await moveSession(session, date, planStart)
      toast(`Movida al ${formatDayLong(date)}`, { label: 'Deshacer', run: () => moveSession({ ...session, date }, session.date, planStart) })
    }
    onClose()
  }

  const dirty = editing || date !== session.date

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={formatDayLong(session.date)}
      left={<Button variant="plain" onClick={onClose}>{dirty ? 'Cancelar' : 'Cerrar'}</Button>}
      right={dirty ? <Button variant="plain" onClick={save} style={{ fontWeight: 600 }}>Guardar</Button> : <Button variant="plain" onClick={() => setEditing(true)}>Editar</Button>}
    >
      <div className="stack-lg">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <SportBadge sport={session.sport} size={44} />
          <div className="grow">
            <div className="t-title3">{session.title}</div>
            <div className="t-sub muted num">
              {[fmtMin(session.durationMin), formatDistance(session.distanceM), `RPE ${session.intensityRpe}`].filter(Boolean).join(' · ')}
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              {session.test && <span className="pill">Prueba de control</span>}
              {session.optional && <span className="pill">Opcional</span>}
              {session.movedFromDate && <span className="pill">Movida</span>}
              {session.status === 'done' && <span className="pill status-done">Hecha</span>}
              {session.status === 'skipped' && <span className="pill">No hecha</span>}
            </div>
          </div>
        </div>

        {editing ? (
          <>
            <Field label="Duración">
              <NumberInput value={duration} onChange={setDuration} suffix="min" step="5" />
            </Field>
            <Field label="Descripción">
              <textarea className="input" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </>
        ) : (
          <p className="t-body" style={{ margin: 0 }}>{session.description}</p>
        )}

        {session.structure?.kind === 'segments' && (
          <div className="group">
            {session.structure.segments.map((g, i) => (
              <div className="cell" key={i}>
                <SportBadge sport={g.sport} size={28} />
                <span className="grow">{g.sport === 'bike' ? 'Bici' : 'Carrera'}</span>
                <span className="value num">{fmtMin(g.durationMin)}</span>
              </div>
            ))}
          </div>
        )}

        {session.status === 'planned' && (
          <Field label="Mover a" hint="Evita dos días seguidos de carrera en las primeras 20 semanas.">
            <Chips
              value={date}
              onChange={setDate}
              options={weekDays.map((d, i) => ({ value: d, label: `${WEEKDAYS_SHORT[i]} ${Number(d.slice(8))}` }))}
            />
            <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Otra fecha" />
          </Field>
        )}

        {!dirty && (
          <div className="stack">
            {session.status === 'planned' && onLog && (
              <div className="row">
                <Button variant="filled" className="grow" onClick={() => onLog(session)}>
                  Hecho
                </Button>
                {onSkip && (
                  <Button className="grow" onClick={() => onSkip(session)}>
                    No he podido
                  </Button>
                )}
              </div>
            )}
            {session.status !== 'planned' && (
              <Button
                onClick={async () => {
                  await resetSession(session)
                  onClose()
                }}
              >
                Volver a pendiente
              </Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}

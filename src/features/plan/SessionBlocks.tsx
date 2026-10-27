import { useState } from 'react'
import { exerciseById, videoUrl, type Exercise } from '../../domain/exercises'
import type { WorkoutBlock, WorkoutItem } from '../../domain/types'
import { Button, Pressable } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Sheet } from '../../ui/Sheet'

/** Bloques de la sesión con sus ejercicios; tocar un ejercicio abre su ficha. */
export function SessionBlocks({ blocks, compact }: { blocks: WorkoutBlock[]; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="stack" style={{ gap: compact ? 10 : 14 }}>
      {blocks.map((b) => (
        <section key={b.name} className="stack" style={{ gap: 4 }}>
          <div className="t-section" style={{ padding: '0 2px' }}>{b.name}</div>
          <div className="group" style={{ background: compact ? 'var(--fill)' : undefined }}>
            {b.items.map((i, k) => (
              <ItemRow key={k} item={i} onOpen={setOpen} />
            ))}
          </div>
        </section>
      ))}
      <ExerciseSheet id={open} onClose={() => setOpen(null)} onSwitch={setOpen} />
    </div>
  )
}

export function dose(i: WorkoutItem): string {
  const parts: string[] = []
  if (i.sets && i.sets > 1 && i.reps) parts.push(`${i.sets} × ${i.reps}`)
  else if (i.reps) parts.push(i.reps)
  else if (i.sets && i.sets > 1) parts.push(`${i.sets} series`)
  if (i.restSec) parts.push(`descanso ${i.restSec >= 90 ? `${(i.restSec / 60).toLocaleString('es-ES', { maximumFractionDigits: 1 })} min` : `${i.restSec} s`}`)
  return parts.join(' · ')
}

function ItemRow({ item: i, onOpen }: { item: WorkoutItem; onOpen: (id: string) => void }) {
  const content = (
    <>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="t-callout" style={{ fontWeight: 500 }}>{i.label}</div>
        {(dose(i) || i.note) && (
          <div className="t-foot muted num">
            {dose(i)}
            {dose(i) && i.note ? ' · ' : ''}
            {i.note}
          </div>
        )}
      </div>
      {i.exerciseId && <Icon name="chevronRight" size={16} strokeWidth={2.2} className="chevron" />}
    </>
  )
  return i.exerciseId ? (
    <Pressable className="cell" onClick={() => onOpen(i.exerciseId!)} aria-label={`Ver cómo se hace: ${i.label}`}>
      {content}
    </Pressable>
  ) : (
    <div className="cell">{content}</div>
  )
}

/** Ficha del ejercicio: cómo se hace, claves, errores, variantes y vídeo. */
export function ExerciseSheet({ id, onClose, onSwitch }: { id: string | null; onClose: () => void; onSwitch: (id: string) => void }) {
  const e = id ? exerciseById(id) : undefined
  return (
    <Sheet open={!!e} onClose={onClose} title={e?.name} left={<Button variant="plain" onClick={onClose}>Cerrar</Button>}>
      {e && <ExerciseDetail e={e} onSwitch={onSwitch} />}
    </Sheet>
  )
}

function ExerciseDetail({ e, onSwitch }: { e: Exercise; onSwitch: (id: string) => void }) {
  const easier = e.easier ? exerciseById(e.easier) : undefined
  const harder = e.harder ? exerciseById(e.harder) : undefined
  return (
    <div className="stack-lg">
      <div className="t-sub muted">{e.muscles}</div>
      <a className="btn tinted block" href={videoUrl(e)} target="_blank" rel="noopener noreferrer">
        <Icon name="play" size={18} /> Ver vídeo de la técnica
      </a>
      <section className="stack" style={{ gap: 6 }}>
        <div className="t-headline">Cómo se hace</div>
        <ol className="t-body" style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6 }}>
          {e.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
      <section className="stack" style={{ gap: 6 }}>
        <div className="t-headline">Claves</div>
        <ul className="t-callout" style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
          {e.cues.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>
      <section className="stack" style={{ gap: 6 }}>
        <div className="t-headline">Errores típicos</div>
        <ul className="t-callout" style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
          {e.mistakes.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>
      {(easier || harder) && (
        <div className="group">
          {easier && (
            <Pressable className="cell" onClick={() => onSwitch(easier.id)}>
              <span className="grow">
                <span className="t-foot muted" style={{ display: 'block' }}>Si te cuesta</span>
                <span className="t-callout">{easier.name}</span>
              </span>
              <Icon name="chevronRight" size={16} strokeWidth={2.2} className="chevron" />
            </Pressable>
          )}
          {harder && (
            <Pressable className="cell" onClick={() => onSwitch(harder.id)}>
              <span className="grow">
                <span className="t-foot muted" style={{ display: 'block' }}>Si se te queda corto</span>
                <span className="t-callout">{harder.name}</span>
              </span>
              <Icon name="chevronRight" size={16} strokeWidth={2.2} className="chevron" />
            </Pressable>
          )}
        </div>
      )}
      <p className="t-foot muted" style={{ margin: 0 }}>
        Si notas dolor (no confundir con esfuerzo), para y prueba la versión más fácil.
      </p>
    </div>
  )
}

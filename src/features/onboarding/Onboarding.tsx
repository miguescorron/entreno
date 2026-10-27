import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { db } from '../../db/db'
import { regeneratePlan } from '../../db/plan'
import { todayISO } from '../../domain/dates'
import { Button } from '../../ui/Button'
import { spring } from '../../ui/motion'
import { DEFAULT_PROFILE, ProfileSection, SECTIONS, validateSection, type ProfileDraft } from '../profile/ProfileForm'

const STEPS = ['welcome', ...SECTIONS.map((s) => s.key)] as const

export function Onboarding() {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [draft, setDraft] = useState<ProfileDraft>(DEFAULT_PROFILE)
  const [busy, setBusy] = useState(false)
  const reduce = useReducedMotion()

  const key = STEPS[step]
  const section = SECTIONS.find((s) => s.key === key)
  const error = section ? validateSection(section.key, draft) : null
  const last = step === STEPS.length - 1

  const go = (d: number) => {
    setDir(d)
    setStep((s) => s + d)
    window.scrollTo({ top: 0 })
  }

  const finish = async () => {
    setBusy(true)
    const profile = { ...draft, createdAt: new Date().toISOString() }
    const id = await db.profile.add(profile)
    await db.bodyLogs.add({ date: todayISO(), weightKg: draft.startWeightKg, note: 'Peso inicial' })
    await regeneratePlan({ ...profile, id })
  }

  // Entra y sale por el mismo eje: avanzar desliza a la izquierda, volver a la derecha.
  const offset = reduce ? 0 : 40
  return (
    <div className="onb">
      <div className="onb-body">
        <div className="progress-track" style={{ marginBottom: 28 }} aria-hidden>
          <motion.div className="progress-fill" initial={false} animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={spring} />
        </div>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={key}
            custom={dir}
            initial={{ opacity: 0, x: dir * offset }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -dir * offset }}
            transition={spring}
          >
            {key === 'welcome' ? (
              <Welcome />
            ) : (
              <div className="stack-lg">
                <div>
                  <div className="t-sub muted">
                    Paso {step} de {STEPS.length - 1}
                  </div>
                  <h1 className="t-large-title" style={{ margin: '4px 0 6px' }}>
                    {section!.title}
                  </h1>
                  <p className="t-body muted" style={{ margin: 0 }}>
                    {section!.lead}
                  </p>
                </div>
                <ProfileSection section={section!.key} value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="onb-foot">
        <div className="stack">
          {error && <div className="t-foot" style={{ color: 'var(--red)', textAlign: 'center' }}>{error}</div>}
          {step === 0 && import.meta.env.VITE_ARTIFACT && (
            <Button
              variant="tinted block"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                const { seedDemo } = await import('../../lib/demo')
                await seedDemo()
              }}
            >
              Ver con datos de ejemplo
            </Button>
          )}
          <div className="row">
            {step > 0 && (
              <Button onClick={() => go(-1)} aria-label="Atrás">
                Atrás
              </Button>
            )}
            <Button variant="filled" className="grow" disabled={!!error || busy} onClick={() => (last ? finish() : go(1))}>
              {step === 0 ? 'Empezar' : last ? (busy ? 'Creando plan…' : 'Crear mi plan') : 'Siguiente'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Welcome() {
  return (
    <div className="stack-lg">
      <div>
        <div className="t-sub muted">Objetivo · octubre 2027</div>
        <h1 className="t-large-title" style={{ margin: '4px 0 10px' }}>
          Gandía 70.3
        </h1>
        <p className="t-body" style={{ margin: 0 }}>
          1,9 km nadando, 90 km en bici y 21,1 km corriendo. 51 semanas para llegar a meta <b>sano y sin lesiones</b>.
        </p>
      </div>
      <div className="card stack">
        <Point icon="🐢" title="Constancia antes que intensidad" text="El 80 % del volumen, suave. +10 % por semana como mucho y descarga cada 4ª semana." />
        <Point icon="✋" title="Te frenaré cuando toque" text="Si subes demasiado rápido, te avisaré y te pediré confirmación." />
        <Point icon="🔒" title="Tus datos se quedan en el móvil" text="Solo se enviará a Claude lo imprescindible de cada consulta." />
      </div>
      <div className="banner">
        <span>⚕️</span>
        <span className="t-sub">Esto no es consejo médico. Antes de empezar, hazte un chequeo con prueba de esfuerzo.</span>
      </div>
    </div>
  )
}

function Point({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <span style={{ fontSize: 24, lineHeight: 1.1 }} aria-hidden>
        {icon}
      </span>
      <div>
        <div className="t-headline">{title}</div>
        <div className="t-sub muted">{text}</div>
      </div>
    </div>
  )
}

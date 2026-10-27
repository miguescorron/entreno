import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { sendToCoach } from '../../ai/coach/coach'
import { aiErrorMessage } from '../../ai/client'
import { db, getSetting, type ChatMessage } from '../../db/db'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { spring } from '../../ui/motion'
import { Screen } from '../../ui/Screen'
import { usePlanContext } from '../hooks'
import { ActionCard } from './ActionCard'
import { AlarmBanner } from './AlarmBanner'

const SUGGESTIONS = ['Hoy he nadado 30 minutos, bien pero cansado', 'No he podido entrenar por trabajo', '¿Cómo voy esta semana?', 'He dormido fatal, ¿qué hago hoy?']

export function CoachScreen() {
  const { profile, today } = usePlanContext()
  const navigate = useNavigate()
  const hasKey = useLiveQuery(async () => !!(await getSetting<string>('anthropicApiKey', '')))
  const messages = useLiveQuery(() => db.chatMessages.orderBy('id').reverse().limit(120).toArray().then((r) => r.reverse())) ?? []
  const location = useLocation()
  const [draft, setDraft] = useState(() => (location.state as { draft?: string } | null)?.draft ?? '')
  const [sending, setSending] = useState(false)
  const [streaming, setStreaming] = useState('')
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  const visible = messages.filter((m) => m.role !== 'tool' && (m.text || m.actions?.length))
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [visible.length, streaming, sending, reduce])

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || sending) return
    setDraft('')
    setSending(true)
    setError(null)
    setStreaming('')
    try {
      await sendToCoach(t, { profile, today, onText: setStreaming })
    } catch (e) {
      setError(aiErrorMessage(e))
    } finally {
      setSending(false)
      setStreaming('')
    }
  }

  if (hasKey === false) {
    return (
      <Screen title="Coach">
        <div className="card empty stack" style={{ alignItems: 'center' }}>
          <div className="icon" aria-hidden>💬</div>
          <div className="t-title3">Conecta a tu coach</div>
          <p className="t-sub muted" style={{ margin: 0 }}>
            Añade tu clave de la API de Claude en Ajustes. Se guarda solo en este iPhone. Pon también un límite de gasto mensual en la consola de Anthropic.
          </p>
          <Button variant="filled" onClick={() => navigate('/ajustes')}>
            Ir a Ajustes
          </Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Coach">
      <div className="stack" style={{ paddingBottom: 96 }}>
        <AlarmBanner />
        {visible.length === 0 && !sending && (
          <div className="stack" style={{ padding: '8px 0 16px' }}>
            <p className="t-body muted" style={{ margin: 0 }}>
              Cuéntame cómo te sientes, qué has entrenado o comido, o por qué no has podido. Lo apunto yo y te digo qué hacer.
            </p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => setDraft(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {visible.map((m, i) => (
            <motion.div key={m.id} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
              {i > 0 && m.sessionId && visible[i - 1].sessionId && m.sessionId !== visible[i - 1].sessionId && (
                <div className="t-caption faint" style={{ textAlign: 'center', padding: '6px 0' }}>
                  Conversación anterior resumida en la memoria del coach
                </div>
              )}
              <Bubble m={m} />
            </motion.div>
          ))}
        </AnimatePresence>
        {sending && (
          <div className="bubble assistant">
            {streaming ? <span style={{ whiteSpace: 'pre-wrap' }}>{streaming}</span> : <TypingDots />}
          </div>
        )}
        {error && (
          <div className="banner red" role="alert">
            <Icon name="warning" size={20} />
            <span className="t-sub">{error}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <textarea
          className="input"
          rows={1}
          value={draft}
          placeholder="Escribe o dicta con el micrófono del teclado"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
              e.preventDefault()
              send(draft)
            }
          }}
          aria-label="Mensaje para el coach"
        />
        <motion.button type="submit" className="icon-btn send" disabled={!draft.trim() || sending} whileTap={{ scale: 0.9 }} aria-label="Enviar">
          <Icon name="send" size={20} strokeWidth={2.2} />
        </motion.button>
      </form>
    </Screen>
  )
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === 'user')
    return (
      <div className="bubble user">
        <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
      </div>
    )
  return (
    <div className="stack" style={{ gap: 8 }}>
      {m.text && (
        <div className="bubble assistant">
          <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
        </div>
      )}
      {m.actions?.map((a, i) => (
        <ActionCard key={i} action={a} messageId={m.id!} index={i} />
      ))}
    </div>
  )
}

function TypingDots() {
  return (
    <span className="typing" aria-label="El coach está escribiendo">
      <i />
      <i />
      <i />
    </span>
  )
}

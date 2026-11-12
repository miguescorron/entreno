import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { imagesOf, MAX_PHOTOS_PER_MESSAGE, sendToCoach } from '../../ai/coach/coach'
import { compressImage } from '../../lib/image'
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
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  const visible = messages.filter((m) => m.role !== 'tool' && (m.text || m.actions?.length || imagesOf(m).length))

  const addPhotos = async (files: FileList | null) => {
    if (!files) return
    const room = MAX_PHOTOS_PER_MESSAGE - photos.length
    const picked = [...files].slice(0, room)
    try {
      // Fotos más pequeñas que en Comida: se reenvían con cada mensaje de la conversación
      const added = await Promise.all(picked.map(async (f) => {
        const blob = await compressImage(f, 1024, 0.8)
        return { blob, url: URL.createObjectURL(blob) }
      }))
      setPhotos((p) => [...p, ...added])
    } catch {
      setError('No he podido abrir esa foto.')
    }
    if (files.length > room) setError(`Como mucho ${MAX_PHOTOS_PER_MESSAGE} fotos por mensaje.`)
  }

  const removePhoto = (i: number) =>
    setPhotos((p) => {
      URL.revokeObjectURL(p[i].url)
      return p.filter((_, k) => k !== i)
    })
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [visible.length, streaming, sending, reduce])

  const send = async (text: string) => {
    const t = text.trim()
    if ((!t && !photos.length) || sending) return
    const sentPhotos = photos
    setDraft('')
    setPhotos([])
    setSending(true)
    setError(null)
    setStreaming('')
    try {
      await sendToCoach(t, { profile, today, onText: setStreaming, photos: sentPhotos.map((p) => p.blob) })
      sentPhotos.forEach((p) => URL.revokeObjectURL(p.url))
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
      <div className="stack" style={{ paddingBottom: photos.length ? 176 : 96 }}>
        <AlarmBanner />
        {visible.length === 0 && !sending && (
          <div className="stack" style={{ padding: '8px 0 16px' }}>
            <p className="t-body muted" style={{ margin: 0 }}>
              Cuéntame cómo te sientes, qué has entrenado o comido, o por qué no has podido. También puedes mandarme fotos: tu plato, la pantalla del reloj, la báscula o cómo haces un ejercicio. Lo apunto yo y te digo qué hacer.
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
        {photos.length > 0 && (
          <div className="composer-photos">
            {photos.map((p, i) => (
              <div key={p.url} className="composer-thumb">
                <img src={p.url} alt={`Foto ${i + 1} para el coach`} />
                <button type="button" onClick={() => removePhoto(i)} aria-label={`Quitar foto ${i + 1}`}>
                  <Icon name="close" size={12} strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="composer-row">
        <motion.button
          type="button"
          className="icon-btn attach"
          whileTap={{ scale: 0.9 }}
          disabled={sending || photos.length >= MAX_PHOTOS_PER_MESSAGE}
          onClick={() => fileRef.current?.click()}
          aria-label="Añadir foto"
        >
          <Icon name="camera" size={20} />
        </motion.button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addPhotos(e.target.files)
            e.target.value = ''
          }}
        />
        <textarea
          className="input"
          rows={1}
          value={draft}
          placeholder={photos.length ? 'Cuéntale qué es la foto (opcional)' : 'Escribe, dicta o manda una foto'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
              e.preventDefault()
              send(draft)
            }
          }}
          aria-label="Mensaje para el coach"
        />
        <motion.button type="submit" className="icon-btn send" disabled={(!draft.trim() && !photos.length) || sending} whileTap={{ scale: 0.9 }} aria-label="Enviar">
          <Icon name="send" size={20} strokeWidth={2.2} />
        </motion.button>
        </div>
      </form>
    </Screen>
  )
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === 'user') {
    const imgs = imagesOf(m)
    return (
      <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
        {imgs.length > 0 && (
          <div className="chat-photos">
            {imgs.map((src, i) => (
              <img key={i} src={src} alt={`Foto ${i + 1} enviada al coach`} loading="lazy" />
            ))}
          </div>
        )}
        {m.text && (
          <div className="bubble user">
            <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
          </div>
        )}
      </div>
    )
  }
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

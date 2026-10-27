import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db, getSetting, setSetting, type Profile } from '../../db/db'
import { downloadBackup, importData, wipeAll } from '../../db/backup'
import { currentWeekNumber, regeneratePlan } from '../../db/plan'
import { ageOn, formatDate, todayISO } from '../../domain/dates'
import { Button, Pressable } from '../../ui/Button'
import { Group, Segmented } from '../../ui/Controls'
import { Icon } from '../../ui/Icon'
import { Screen } from '../../ui/Screen'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { aiErrorMessage, testConnection } from '../../ai/client'
import { useCurrentProfile } from '../hooks'
import { ProfileSection, SECTIONS, validateSection, type ProfileDraft, type SectionKey } from '../profile/ProfileForm'

export const MODELS = [
  { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { value: 'claude-haiku-5-5', label: 'Haiku 5.5' },
] as const

export function SettingsScreen() {
  const profile = useCurrentProfile()
  const [section, setSection] = useState<SectionKey | null>(null)
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const onImport = async (file?: File) => {
    if (!file) return
    try {
      await importData(JSON.parse(await file.text()))
      toast('Copia restaurada')
    } catch {
      toast('Ese archivo no es una copia válida')
    }
  }

  const age = profile.birthDate ? ageOn(profile.birthDate, todayISO()) : undefined

  return (
    <Screen title="Ajustes" back="/" tabbar={false}>
      <div className="stack-lg">
        <Group title="Perfil">
          <Cell label="Sobre ti" value={[profile.name, age && `${age} años`, `${profile.heightCm} cm`].filter(Boolean).join(' · ')} onClick={() => setSection('basics')} />
          <Cell label="Natación" value={{ no: 'Sin crol', basic: 'Crol básico', good: 'Crol bien' }[profile.swimCrawl]} onClick={() => setSection('swim')} />
          <Cell label="Material" onClick={() => setSection('gear')} />
          <Cell label="Tu tiempo" value={`${String(profile.weeklyHoursAvailable).replace('.', ',')} h/sem`} onClick={() => setSection('availability')} />
          <Cell label="Salud" value={profile.medicalCheckDone ? 'Chequeo hecho' : 'Chequeo pendiente'} onClick={() => setSection('health')} />
          <Cell label="Alimentación" onClick={() => setSection('food')} />
        </Group>

        <Group title="Carrera" foot="Si cambias la fecha, las horas o los días, las sesiones pendientes se recalculan. Las hechas se conservan.">
          <Cell label={profile.raceName} value={formatDate(profile.raceDate)} onClick={() => setSection('race')} />
        </Group>

        <AiSettings />

        <Group title="Tus datos" foot="Todo se guarda solo en este iPhone. Haz una copia de vez en cuando y guárdala en Archivos o iCloud Drive.">
          <Cell label="Exportar copia (JSON)" onClick={() => downloadBackup()} tint />
          <Cell label="Importar copia" onClick={() => fileRef.current?.click()} tint />
          <Cell
            label="Borrar todos los datos"
            danger
            onClick={async () => {
              if (window.confirm('Se borrarán el perfil, el plan y todos tus registros de este dispositivo. No se puede deshacer. ¿Seguro?')) {
                await wipeAll()
                window.location.reload()
              }
            }}
          />
        </Group>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />

        <Group title="Privacidad">
          <div className="cell t-sub" style={{ display: 'block' }}>
            Tus datos de salud no salen del móvil. Al usar el coach o la foto de comida, solo se envía a la API de Claude lo imprescindible de esa consulta: el texto, la foto o un resumen. Esto no es consejo médico.
          </div>
        </Group>
      </div>

      <ProfileSheet profile={profile} section={section} onClose={() => setSection(null)} />
    </Screen>
  )
}

function Cell({ label, value, onClick, tint, danger }: { label: string; value?: string; onClick: () => void; tint?: boolean; danger?: boolean }) {
  return (
    <Pressable className="cell" onClick={onClick}>
      <span className="grow t-body" style={{ color: danger ? 'var(--red)' : tint ? 'var(--tint)' : undefined }}>
        {label}
      </span>
      {value && <span className="value t-body num">{value}</span>}
      {!danger && !tint && <Icon name="chevronRight" size={16} strokeWidth={2.2} className="chevron" />}
    </Pressable>
  )
}

function ProfileSheet({ profile, section, onClose }: { profile: Profile; section: SectionKey | null; onClose: () => void }) {
  const [draft, setDraft] = useState<ProfileDraft>(profile)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => {
    if (section) setDraft(profile)
  }, [section, profile])

  const meta = SECTIONS.find((s) => s.key === section)
  const error = section ? validateSection(section, draft) : null

  const save = async () => {
    const raceChanged = draft.raceDate !== profile.raceDate || draft.raceName !== profile.raceName
    const hoursChanged = draft.weeklyHoursAvailable !== profile.weeklyHoursAvailable || draft.availableDays.join() !== profile.availableDays.join()
    if ((raceChanged || hoursChanged) && !window.confirm('Se recalcularán las sesiones pendientes del plan (las hechas se conservan). ¿Seguir?')) return
    setBusy(true)
    await db.profile.update(profile.id!, draft)
    if (raceChanged || hoursChanged) {
      const next = { ...profile, ...draft }
      // Fecha nueva: se rehace todo. Horas o días: desde la semana que viene.
      const from = raceChanged ? 1 : Math.min(51, (currentWeekNumber(next) ?? 0) + 1)
      await regeneratePlan(next, Math.max(1, from))
      toast('Plan recalculado')
    }
    setBusy(false)
    onClose()
  }

  return (
    <Sheet
      open={!!section}
      onClose={onClose}
      title={meta?.title}
      left={<Button variant="plain" onClick={onClose}>Cancelar</Button>}
      right={
        <Button variant="plain" disabled={!!error || busy} onClick={save} style={{ fontWeight: 600 }}>
          Guardar
        </Button>
      }
    >
      {section && (
        <div className="stack-lg">
          <ProfileSection section={section} value={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
          {error && <div className="t-foot" style={{ color: 'var(--red)' }}>{error}</div>}
        </div>
      )}
    </Sheet>
  )
}

function AiSettings() {
  const model = useLiveQuery(() => getSetting<string>('apiModel', 'claude-sonnet-5-5'))
  const hasKey = useLiveQuery(async () => !!(await getSetting<string>('anthropicApiKey', '')))
  const [editing, setEditing] = useState(false)
  const [key, setKey] = useState('')
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'error'; text?: string }>({ state: 'idle' })
  const toast = useToast()

  const runTest = async () => {
    setTest({ state: 'busy' })
    try {
      const r = await testConnection()
      setTest({ state: 'ok', text: `Funciona: ${r.model} respondió en ${(r.ms / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s` })
    } catch (e) {
      setTest({ state: 'error', text: aiErrorMessage(e) })
    }
  }

  return (
    <>
      <Group
        title="Coach IA (Claude)"
        foot={
          <>
            La clave se guarda solo en este dispositivo y nunca va en las copias de seguridad. <b>Pon un límite de gasto mensual</b> en console.anthropic.com → Settings → Limits.
          </>
        }
      >
        <Pressable className="cell" onClick={() => setEditing(true)}>
          <span className="grow t-body">Clave de API</span>
          <span className="value t-body">{hasKey ? '••••••••' : 'Sin configurar'}</span>
          <Icon name="chevronRight" size={16} strokeWidth={2.2} className="chevron" />
        </Pressable>
        <div className="cell">
          <span className="t-body" style={{ flex: 'none' }}>Modelo</span>
          <div className="grow">
            <Segmented value={model ?? 'claude-sonnet-5-5'} onChange={(v) => setSetting('apiModel', v)} options={MODELS.map((m) => ({ value: m.value, label: m.label }))} />
          </div>
        </div>
        {hasKey && (
          <Pressable className="cell" onClick={runTest} disabled={test.state === 'busy'}>
            <span className="grow">
              <span className="t-body" style={{ color: 'var(--tint)' }}>
                {test.state === 'busy' ? 'Probando…' : 'Probar conexión'}
              </span>
              {test.text && (
                <span className="t-foot" style={{ display: 'block', color: test.state === 'ok' ? 'var(--green)' : 'var(--red)' }}>
                  {test.text}
                </span>
              )}
            </span>
            {test.state === 'ok' && <Icon name="check" size={20} strokeWidth={2.4} className="status-done" />}
          </Pressable>
        )}
      </Group>
      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="Clave de API"
        left={<Button variant="plain" onClick={() => setEditing(false)}>Cancelar</Button>}
        right={
          <Button
            variant="plain"
            style={{ fontWeight: 600 }}
            disabled={!key.trim().startsWith('sk-')}
            onClick={async () => {
              await setSetting('anthropicApiKey', key.trim())
              setKey('')
              setTest({ state: 'idle' })
              setEditing(false)
              toast('Clave guardada')
            }}
          >
            Guardar
          </Button>
        }
      >
        <div className="stack-lg">
          <input className="input" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
          <p className="t-foot muted" style={{ margin: 0 }}>
            Créala en console.anthropic.com → API Keys. Las llamadas van directas de tu iPhone a Anthropic, sin servidores intermedios.
          </p>
          {hasKey && (
            <Button
              variant="danger"
              onClick={async () => {
                await db.settings.delete('anthropicApiKey')
                setEditing(false)
              }}
            >
              Borrar clave
            </Button>
          )}
        </div>
      </Sheet>
    </>
  )
}

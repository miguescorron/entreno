import { useLiveQuery } from 'dexie-react-hooks'
import { clearAlarm, getAlarm } from '../../db/guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'

/** Aviso fijo de señal de alarma (spec §13): no desaparece hasta que el usuario confirma. */
export function AlarmBanner() {
  const alarm = useLiveQuery(() => getAlarm())
  if (!alarm) return null
  return (
    <div className="banner red" role="alert" style={{ alignItems: 'flex-start' }}>
      <Icon name="warning" size={22} style={{ color: 'var(--red)', flex: 'none', marginTop: 2 }} />
      <div className="grow stack" style={{ gap: 8 }}>
        <div className="t-sub">
          <b>Para y consulta con un médico.</b> Has descrito {alarm.symptoms.join(', ')}. No sigas con el plan hasta que te valoren.
        </div>
        <Button
          variant="small tinted danger"
          style={{ alignSelf: 'flex-start' }}
          onClick={async () => {
            if (window.confirm('¿Te ha valorado un médico y te ha dado el visto bueno para seguir entrenando?')) await clearAlarm()
          }}
        >
          Ya me ha valorado un médico
        </Button>
      </div>
    </div>
  )
}

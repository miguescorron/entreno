import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { acknowledgeAlerts, pendingAlerts } from '../../db/guardrails'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { spring } from '../../ui/motion'
import { useCurrentProfile, useToday } from '../hooks'

/** Alertas del freno de ambición pendientes de confirmar (spec §8.4). */
export function AlertsCard() {
  const profile = useCurrentProfile()
  const today = useToday()
  const alerts = useLiveQuery(() => pendingAlerts(profile, today), [profile, today]) ?? []
  return (
    <AnimatePresence initial={false}>
      {alerts.map((a) => (
        <motion.div key={a.key + a.id} className="banner" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0, padding: 0 }} transition={spring}>
          <Icon name="warning" size={20} style={{ color: 'var(--orange)', flex: 'none', marginTop: 1 }} />
          <div className="grow stack" style={{ gap: 6 }}>
            <div className="t-sub">
              <b>{a.title}.</b> {a.message}
            </div>
            <Button variant="small tinted" style={{ alignSelf: 'flex-start' }} onClick={() => acknowledgeAlerts([a])}>
              Entendido
            </Button>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  )
}

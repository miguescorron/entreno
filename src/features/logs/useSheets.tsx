import { useCallback, useState } from 'react'
import type { PlanSession } from '../../db/db'
import type { ISODate } from '../../domain/dates'
import { SessionSheet } from '../plan/SessionSheet'
import { CheckinSheet } from './CheckinSheet'
import { SkipSheet } from './SkipSheet'
import { WorkoutLogSheet } from './WorkoutLogSheet'

type Kind = 'session' | 'log' | 'skip' | 'checkin' | 'extra'

/** Una sola hoja abierta a la vez; cambiar de una a otra cierra la anterior. */
export function useSheets(planStart: ISODate, today: ISODate) {
  const [state, setState] = useState<{ kind: Kind; session?: PlanSession } | null>(null)
  const open = useCallback((kind: Kind, session?: PlanSession) => setState({ kind, session }), [])
  const close = useCallback(() => setState(null), [])
  const s = state?.session

  const sheets = (
    <>
      <SessionSheet
        open={state?.kind === 'session'}
        onClose={close}
        session={state?.kind === 'session' ? s : undefined}
        planStart={planStart}
        onLog={(x) => open('log', x)}
        onSkip={(x) => open('skip', x)}
      />
      <WorkoutLogSheet open={state?.kind === 'log' || state?.kind === 'extra'} onClose={close} session={state?.kind === 'log' ? s : undefined} date={s?.date ?? today} />
      <SkipSheet open={state?.kind === 'skip'} onClose={close} session={s} />
      <CheckinSheet open={state?.kind === 'checkin'} onClose={close} date={today} />
    </>
  )
  return { open, sheets }
}

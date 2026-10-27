import { useLiveQuery } from 'dexie-react-hooks'
import { confirmAction, undoAction } from '../../ai/coach/coach'
import { db, type CoachAction } from '../../db/db'
import { acknowledgeAlerts } from '../../db/guardrails'
import { acceptProposal, rejectProposal } from '../../db/proposals'
import type { Alert } from '../../domain/guardrails/ambition'
import { Button } from '../../ui/Button'
import { Icon, type IconName } from '../../ui/Icon'
import { useToast } from '../../ui/Toast'

const ICON: Record<CoachAction['kind'], IconName> = {
  workout: 'check',
  checkin: 'heart',
  skip: 'undo',
  meal: 'food',
  proposal: 'plan',
  alarm: 'warning',
}

const LABEL: Record<CoachAction['kind'], string> = {
  workout: 'Guardado',
  checkin: 'Guardado',
  skip: 'Guardado',
  meal: 'Guardado',
  proposal: 'Propuesta de cambio',
  alarm: 'Aviso',
}

/** Tarjeta de lo que el coach ha guardado o propuesto, con deshacer. */
export function ActionCard({ action, messageId, index }: { action: CoachAction; messageId: number; index: number }) {
  if (action.kind === 'proposal' && action.proposalId) return <ProposalCard id={action.proposalId} summary={action.summary} />
  const pendingAlerts = (action.alerts ?? []).length > 0 && !action.confirmed && !action.undone
  return (
    <div className="card tight stack" style={{ gap: 8, opacity: action.undone ? 0.55 : 1 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="sport-badge" style={{ width: 28, height: 28, borderRadius: 8, background: action.kind === 'alarm' ? 'var(--red)' : 'var(--green)' }}>
          <Icon name={ICON[action.kind]} size={16} strokeWidth={2.2} />
        </span>
        <div className="grow">
          <div className="t-caption muted">{action.undone ? 'Deshecho' : LABEL[action.kind]}</div>
          <div className={`t-sub ${action.undone ? 'status-skipped' : ''}`}>{action.summary}</div>
        </div>
        {action.undo && !action.undone && !pendingAlerts && (
          <Button variant="small plain" onClick={() => undoAction(messageId, index)}>
            Deshacer
          </Button>
        )}
      </div>
      {pendingAlerts && (
        <div className="banner" style={{ padding: '10px 12px' }}>
          <div className="stack grow" style={{ gap: 6 }}>
            {action.alerts!.map((a) => (
              <div key={a.key + a.id} className="t-foot">
                <b>{a.title}.</b> {a.message}
              </div>
            ))}
            <div className="row" style={{ gap: 8 }}>
              <Button
                variant="small tinted"
                onClick={async () => {
                  await acknowledgeAlerts(action.alerts as Alert[])
                  await confirmAction(messageId, index)
                }}
              >
                Lo sé, confirmo
              </Button>
              <Button variant="small" onClick={() => undoAction(messageId, index)}>
                Deshacer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ProposalCard({ id, summary }: { id: number; summary: string }) {
  const p = useLiveQuery(() => db.planProposals.get(id), [id])
  const toast = useToast()
  const status = p?.status ?? 'pending'
  return (
    <div className="card tight stack" style={{ gap: 8, outline: status === 'pending' ? '1.5px solid color-mix(in srgb, var(--tint) 45%, transparent)' : undefined }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="sport-badge" style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--tint)' }}>
          <Icon name="plan" size={16} strokeWidth={2} />
        </span>
        <div className="grow">
          <div className="t-caption muted">{status === 'pending' ? 'Propuesta de cambio del plan' : status === 'accepted' ? 'Aceptada' : 'Rechazada'}</div>
          <div className="t-sub">{p?.summary ?? summary}</div>
          {p?.reason && <div className="t-foot muted">Motivo: {p.reason}</div>}
        </div>
      </div>
      {status === 'pending' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button
            variant="small filled"
            onClick={async () => {
              await acceptProposal(id)
              toast('Plan actualizado')
            }}
          >
            Aceptar
          </Button>
          <Button variant="small" onClick={() => rejectProposal(id)}>
            Rechazar
          </Button>
        </div>
      )}
    </div>
  )
}

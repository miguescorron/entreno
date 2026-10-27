import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { aiErrorMessage } from '../../ai/client'
import { db, getSetting } from '../../db/db'
import { planStartFor } from '../../db/plan'
import { generateReview, maybeAutoReview, parseReview, reviewWeekFor } from '../../db/review'
import { Button } from '../../ui/Button'
import { ProposalCard } from '../coach/ActionCard'
import { usePlanContext } from '../hooks'
import { LIGHT_COLOR } from './ProgressScreen'
import type { Light } from '../../domain/progress/rules'

/** Revisión semanal: se genera sola el domingo por la noche o al abrir la app después. */
export function WeeklyReviewCard({ compact }: { compact?: boolean }) {
  const { profile, today } = usePlanContext()
  const week = reviewWeekFor(planStartFor(profile), today, new Date().getHours())
  const review = useLiveQuery(() => (week ? db.weeklyReviews.where('weekNumber').equals(week).last() : undefined), [week])
  const hasKey = useLiveQuery(async () => !!(await getSetting<string>('anthropicApiKey', '')))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!week || review || !hasKey) return
    setBusy(true)
    maybeAutoReview(profile, today, new Date().getHours())
      .catch((e) => setError(aiErrorMessage(e)))
      .finally(() => setBusy(false))
  }, [week, review, hasKey, profile, today])

  if (!week) return null
  if (!review) {
    if (compact && !busy) return null
    return (
      <div className="card stack" style={{ gap: 8 }}>
        <div className="t-headline">Revisión de la semana {week}</div>
        {busy ? (
          <div className="row t-sub muted">
            <div className="spinner" style={{ width: 20, height: 20 }} /> Preparando la revisión…
          </div>
        ) : (
          <>
            <div className="t-sub muted">{hasKey ? 'Aún no está hecha.' : 'Necesita la clave de Claude en Ajustes.'}</div>
            {error && <div className="t-foot" style={{ color: 'var(--red)' }}>{error}</div>}
            {hasKey && (
              <Button
                variant="small tinted"
                style={{ alignSelf: 'flex-start' }}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    await generateReview(profile, week, today)
                  } catch (e) {
                    setError(aiErrorMessage(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Generar ahora
              </Button>
            )}
          </>
        )}
      </div>
    )
  }

  const r = parseReview(review.summaryText)
  const ids = ((review.adjustmentsJson as { proposalIds?: number[] } | undefined)?.proposalIds ?? []) as number[]
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        {r.light && <span className="light-dot" style={{ background: LIGHT_COLOR[r.light as Light] }} aria-hidden />}
        <div className="t-headline">Revisión de la semana {review.weekNumber}</div>
      </div>
      <div className="t-sub" style={{ whiteSpace: 'pre-wrap' }}>{r.resumen}</div>
      {!compact && (
        <>
          {r.acierto && (
            <div className="t-sub">
              <b>Bien:</b> {r.acierto}
            </div>
          )}
          {r.mejora && (
            <div className="t-sub">
              <b>A mejorar:</b> {r.mejora}
            </div>
          )}
        </>
      )}
      {ids.map((id) => (
        <ProposalCard key={id} id={id} summary="" />
      ))}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

// Gráficos SVG propios: líneas de 2 px, barras ≤ 24 px con extremo redondeado
// de 4 px, rejilla de 1 px recesiva, cruceta + tooltip, leyenda y tabla.

const PAD = { top: 12, right: 12, bottom: 24, left: 36 }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(320)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Ticks redondos: 3-5 valores limpios entre min y max. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1
    max += 1
  }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

const fmtTick = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}K` : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }))

export interface LegendItem {
  label: string
  color: string
  shape: 'line' | 'rect' | 'dot'
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="chart-legend">
      {items.map((i) => (
        <span key={i.label} className="t-caption">
          <i className={`key ${i.shape}`} style={{ background: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: { label: string; value: string; color?: string }[] }) {
  const left = Math.min(Math.max(x - 80, 0), width - 160)
  return (
    <div className="chart-tip" style={{ left }} role="status">
      <div className="t-caption muted">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="row" style={{ gap: 6 }}>
          {r.color && <i className="key line" style={{ background: r.color }} aria-hidden />}
          <b className="num">{r.value}</b>
          <span className="t-caption muted">{r.label}</span>
        </div>
      ))}
    </div>
  )
}

export function ChartTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="chart-table">
      <summary className="t-foot">Ver tabla</summary>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="num">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

// ---------- líneas ----------

export interface LineSeries {
  key: string
  label: string
  color: string
  kind: 'line' | 'dots'
  points: { x: number; y: number }[]
}

export function LineChart({
  series,
  refLines = [],
  height = 180,
  xLabel,
  yFormat = (n) => fmtTick(n),
  yDomain,
}: {
  series: LineSeries[]
  refLines?: { y: number; label: string; color: string }[]
  height?: number
  xLabel: (x: number) => string
  yFormat?: (n: number) => string
  yDomain?: [number, number]
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const all = series.flatMap((s) => s.points)
  const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b)
  if (!xs.length) return <div className="t-sub muted" style={{ padding: '24px 0', textAlign: 'center' }}>Sin datos todavía.</div>

  const ys = [...all.map((p) => p.y), ...refLines.map((r) => r.y)]
  const ticks = niceTicks(yDomain?.[0] ?? Math.min(...ys), yDomain?.[1] ?? Math.max(...ys))
  const y0 = ticks[0]
  const y1 = ticks[ticks.length - 1]
  const x0 = xs[0]
  const x1 = xs[xs.length - 1] === x0 ? x0 + 1 : xs[xs.length - 1]
  const iw = width - PAD.left - PAD.right
  const ih = height - PAD.top - PAD.bottom
  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0)) * iw
  const sy = (y: number) => PAD.top + (1 - (y - y0) / (y1 - y0)) * ih

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    let best = xs[0]
    for (const x of xs) if (Math.abs(sx(x) - px) < Math.abs(sx(best) - px)) best = x
    setHover(best)
  }

  const xTicks = [xs[0], xs[Math.floor((xs.length - 1) / 2)], xs[xs.length - 1]].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" style={{ display: 'block', touchAction: 'pan-y' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={sy(t)} y2={sy(t)} stroke="var(--separator)" strokeWidth={1} />
            <text x={PAD.left - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="chart-axis">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xTicks.map((x) => (
          <text key={x} x={sx(x)} y={height - 6} textAnchor={x === x0 ? 'start' : x === xs[xs.length - 1] ? 'end' : 'middle'} className="chart-axis">
            {xLabel(x)}
          </text>
        ))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={PAD.left} x2={width - PAD.right} y1={sy(r.y)} y2={sy(r.y)} stroke={r.color} strokeWidth={1.5} opacity={0.7} />
            <text x={width - PAD.right} y={sy(r.y) - 4} textAnchor="end" className="chart-axis">
              {r.label}
            </text>
          </g>
        ))}
        {series.map((s) =>
          s.kind === 'line' ? (
            <path
              key={s.key}
              d={s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join('')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : (
            <g key={s.key}>
              {s.points.map((p) => (
                <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={3.5} fill={s.color} stroke="var(--bg-elevated)" strokeWidth={2} opacity={0.75} />
              ))}
            </g>
          ),
        )}
        {series
          .filter((s) => s.kind === 'line' && s.points.length)
          .map((s) => {
            const p = s.points[s.points.length - 1]
            return <circle key={`end-${s.key}`} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color} stroke="var(--bg-elevated)" strokeWidth={2} />
          })}
        {hover != null && <line x1={sx(hover)} x2={sx(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--label-3)" strokeWidth={1} />}
        {hover != null &&
          series.map((s) => {
            const p = s.points.find((q) => q.x === hover)
            return p ? <circle key={`h-${s.key}`} cx={sx(p.x)} cy={sy(p.y)} r={4.5} fill={s.color} stroke="var(--bg-elevated)" strokeWidth={2} /> : null
          })}
      </svg>
      {hover != null && (
        <Tooltip
          x={sx(hover)}
          width={width}
          title={xLabel(hover)}
          rows={series.flatMap((s) => {
            const p = s.points.find((q) => q.x === hover)
            return p ? [{ label: s.label, value: yFormat(p.y), color: s.color }] : []
          })}
        />
      )}
    </div>
  )
}

// ---------- barras (apiladas o simples) ----------

export interface BarSeries {
  key: string
  label: string
  color: string
}

export interface BarDatum {
  label: string
  title: string
  values: Record<string, number>
  /** Opacidad reducida (p. ej. semana en curso) */
  faded?: boolean
  note?: string
}

export function BarChart({
  data,
  series,
  height = 180,
  yFormat = (n) => fmtTick(n),
  refLine,
  footer,
}: {
  data: BarDatum[]
  series: BarSeries[]
  height?: number
  yFormat?: (n: number) => string
  refLine?: { y: number; label: string }
  footer?: ReactNode
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const totals = useMemo(() => data.map((d) => series.reduce((a, s) => a + (d.values[s.key] ?? 0), 0)), [data, series])
  if (!data.length) return <div className="t-sub muted" style={{ padding: '24px 0', textAlign: 'center' }}>Sin datos todavía.</div>

  const ticks = niceTicks(0, Math.max(1, ...totals, refLine?.y ?? 0))
  const yMax = ticks[ticks.length - 1]
  const iw = width - PAD.left - PAD.right
  const ih = height - PAD.top - PAD.bottom
  const band = iw / data.length
  const barW = Math.min(24, band * 0.62)
  const sy = (v: number) => PAD.top + (1 - v / yMax) * ih
  const labelEvery = Math.ceil(data.length / 8)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={width} height={height} role="img" style={{ display: 'block' }} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={sy(t)} y2={sy(t)} stroke="var(--separator)" strokeWidth={1} />
            <text x={PAD.left - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="chart-axis">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {refLine && (
          <g>
            <line x1={PAD.left} x2={width - PAD.right} y1={sy(refLine.y)} y2={sy(refLine.y)} stroke="var(--label-2)" strokeWidth={1} />
            <text x={width - PAD.right} y={sy(refLine.y) - 4} textAnchor="end" className="chart-axis">
              {refLine.label}
            </text>
          </g>
        )}
        {data.map((d, i) => {
          const cx = PAD.left + band * i + band / 2
          let acc = 0
          const segs = series.filter((s) => (d.values[s.key] ?? 0) > 0)
          return (
            <g key={d.label + i} opacity={d.faded ? 0.45 : hover != null && hover !== i ? 0.6 : 1}>
              {segs.map((s, k) => {
                const v = d.values[s.key]
                const yTop = sy(acc + v)
                const yBot = sy(acc)
                acc += v
                const top = k === segs.length - 1
                // 2 px de separación entre segmentos (el hueco es el fondo)
                const h = Math.max(0, yBot - yTop - (k > 0 ? 2 : 0))
                const r = top ? Math.min(4, h) : 0
                const x = cx - barW / 2
                const y = yTop
                return (
                  <path
                    key={s.key}
                    d={`M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${y + h}Z`}
                    fill={s.color}
                  />
                )
              })}
              {i % labelEvery === 0 && (
                <text x={cx} y={height - 6} textAnchor="middle" className="chart-axis">
                  {d.label}
                </text>
              )}
              {/* zona de toque: toda la banda */}
              <rect
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={ih}
                fill="transparent"
                tabIndex={0}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${d.title}: ${yFormat(totals[i])}`}
              />
            </g>
          )
        })}
      </svg>
      {hover != null && (
        <Tooltip
          x={PAD.left + band * hover + band / 2}
          width={width}
          title={`${data[hover].title}${data[hover].note ? ` · ${data[hover].note}` : ''}`}
          rows={[
            ...(series.length > 1 ? [{ label: 'total', value: yFormat(totals[hover]) }] : []),
            ...series
              .filter((s) => (data[hover].values[s.key] ?? 0) > 0 || series.length === 1)
              .map((s) => ({ label: s.label, value: yFormat(data[hover].values[s.key] ?? 0), color: s.color })),
          ]}
        />
      )}
      {footer}
    </div>
  )
}

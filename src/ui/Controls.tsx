import { motion } from 'motion/react'
import { useId, type ReactNode } from 'react'
import { springFast } from './motion'

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const id = useId()
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.i layoutId={`thumb-${id}`} className="thumb" transition={springFast} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string | number>({ value, options, onChange, multi }: { value: T | T[]; options: { value: T; label: string }[]; onChange: (v: T) => void; multi?: boolean }) {
  const isOn = (v: T) => (multi ? (value as T[]).includes(v) : value === v)
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={String(o.value)} className="chip" aria-pressed={isOn(o.value)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Escala 1..n con botones (energía, ánimo, calidad de sueño…). Pulsar el valor activo lo borra. */
export function Rating({ value, onChange, max = 5, min = 1 }: { value?: number; onChange: (v?: number) => void; max?: number; min?: number }) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => i + min)
  return (
    <div className="rating" style={{ gridTemplateColumns: `repeat(${values.length}, 1fr)` }}>
      {values.map((v) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(value === v ? undefined : v)}>
          {v}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <label className="t-section">{label}</label>
      {children}
      {hint && <div className="t-foot muted" style={{ padding: '0 4px' }}>{hint}</div>}
    </div>
  )
}

export function NumberInput({ value, onChange, placeholder, step = 'any', suffix }: { value?: number; onChange: (v?: number) => void; placeholder?: string; step?: string; suffix?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input num"
        type="number"
        inputMode="decimal"
        step={step}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value.replace(',', '.')
          onChange(v === '' ? undefined : Number(v))
        }}
        style={suffix ? { paddingRight: 48 } : undefined}
      />
      {suffix && <span className="muted" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>{suffix}</span>}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  )
}

export function Group({ title, foot, children }: { title?: string; foot?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {title && <div className="group-title t-section">{title}</div>}
      <div className="group">{children}</div>
      {foot && <div className="group-foot t-foot muted">{foot}</div>}
    </section>
  )
}

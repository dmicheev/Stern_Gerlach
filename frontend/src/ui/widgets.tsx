import type { ReactNode } from 'react'
import { Hint } from './Hint'

export function Section({
  title,
  children,
  right,
  hint,
}: {
  title: string
  children: ReactNode
  right?: ReactNode
  hint?: string
}) {
  return (
    <div className="section">
      <div className="section-title">
        <span>
          {title}
          {hint && (
            <>
              {' '}
              <Hint id={hint} />
            </>
          )}
        </span>
        {right}
      </div>
      {children}
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (v: number) => void
  hint?: string
}

export function Slider({ label, value, min, max, step, display, onChange, hint }: SliderProps) {
  return (
    <label className="slider-row">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="slider-value">{display}</span>
      <span className="slider-hint">{hint && <Hint id={hint} />}</span>
    </label>
  )
}

/** label + "?" for select rows and other non-slider controls */
export function HintLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span className="slider-label">
      {children} <Hint id={id} />
    </span>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  title,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  title?: string
  hint?: string
}) {
  return (
    <label className="toggle" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      {hint && <Hint id={hint} />}
    </label>
  )
}

import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from './icons'

export function Section({ title, icon, children, defaultOpen = true, badge }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-stone-200/80 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left transition-colors hover:bg-stone-50"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-stone-900">
          {icon && <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand">{icon}</span>}
          {title}
          {badge}
        </span>
        <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform duration-200 group-hover:text-stone-600 ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-4 px-5 pb-5">{children}</div>}
    </section>
  )
}

export function Field({ label, hint, children, group }: { label: string; hint?: ReactNode; children: ReactNode; group?: boolean }) {
  const inner = (
    <>
      <span className="mb-1.5 block text-xs font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-snug text-stone-500">{hint}</span>}
    </>
  )
  // Groups of buttons must not sit inside a <label> (it would rename every button).
  return group ? <div className="block" role="group" aria-label={label}>{inner}</div> : <label className="block">{inner}</label>
}

const inputCls =
  'w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-900 shadow-xs transition placeholder:text-stone-400 hover:border-stone-300 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 disabled:bg-stone-50 disabled:text-stone-400'

/** Whole-number input that may be left empty (null). */
export function OptionalIntInput({ value, onChange, min, placeholder, ariaLabel }: {
  value: number | null; onChange: (v: number | null) => void; min?: number; placeholder?: string; ariaLabel?: string
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      className={inputCls}
      value={value ?? ''}
      min={min}
      step={1}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10)
        onChange(Number.isFinite(v) ? Math.max(min ?? -Infinity, v) : null)
      }}
    />
  )
}

export function NumberInput({ value, onChange, min, max, step = 1, suffix, disabled }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; disabled?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (raw: string) => {
    const v = parseFloat(raw)
    if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)))
    setDraft(null)
  }
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        className={inputCls + (suffix ? ' pr-9' : '')}
        value={draft ?? String(value)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v)
        }}
        onBlur={(e) => commit(e.target.value)}
      />
      {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">{suffix}</span>}
    </div>
  )
}

export function Select<T extends string | number>({ value, onChange, options, disabled }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean
}) {
  return (
    <select
      className={inputCls}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value)
        if (o) onChange(o.value)
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-stone-300 transition-colors peer-checked:bg-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
      />
      <span>
        <span className="block text-sm font-medium text-stone-800">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-stone-500">{hint}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex w-full gap-0.5 rounded-lg border border-stone-200 bg-stone-100 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${value === o.value ? 'bg-brand text-white shadow-sm' : 'text-stone-600 hover:bg-white hover:text-brand'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function FileButton({ accept, multiple, onFiles, children, variant = 'secondary', size = 'sm', directory }: {
  accept?: string; multiple?: boolean; onFiles: (f: File[]) => void; children: ReactNode; variant?: 'primary' | 'secondary'; size?: 'md' | 'sm'; directory?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className={btnCls(variant, size)} onClick={() => ref.current?.click()}>{children}</button>
      <input
        ref={ref}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        {...(directory ? { webkitdirectory: '' } : {})}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </>
  )
}

export function DropZone({ onFiles, children, accept }: { onFiles: (f: File[]) => void; children: ReactNode; accept?: RegExp }) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const files = Array.from(e.dataTransfer.files).filter((f) => !accept || accept.test(f.name))
        if (files.length) onFiles(files)
      }}
      className={`rounded-xl border-2 border-dashed px-3 py-4 text-center text-xs transition-colors ${over ? 'border-brand bg-brand-50' : 'border-stone-200 bg-stone-50/70 hover:border-stone-300'}`}
    >
      {children}
    </div>
  )
}

const btnBase = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:cursor-not-allowed'
export const btnCls = (variant: 'primary' | 'secondary' | 'ghost' = 'secondary', size: 'md' | 'sm' = 'md') =>
  ({
    primary: `${btnBase} ${size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'} bg-brand text-white shadow-sm shadow-brand/20 hover:bg-brand-600 active:bg-brand-700 disabled:bg-stone-300 disabled:shadow-none`,
    secondary: `${btnBase} ${size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'} border border-brand/40 bg-white text-brand shadow-xs hover:border-brand hover:bg-brand-50 active:bg-brand-100 disabled:opacity-50`,
    ghost: `${btnBase} px-2 py-1 text-xs text-brand hover:bg-brand-50 active:bg-brand-100 disabled:opacity-40`,
  })[variant]

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'error' | 'ok' | 'info'; children: ReactNode }) {
  const c = {
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
  }[tone]
  return <div className={`rounded-lg border px-3 py-2 text-xs leading-snug ${c}`}>{children}</div>
}

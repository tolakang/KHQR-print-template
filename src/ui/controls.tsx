import { useRef, useState, type ReactNode } from 'react'

export function Section({ title, children, defaultOpen = true, badge }: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-stone-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold uppercase tracking-wide text-stone-700 hover:bg-stone-50"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">{title}{badge}</span>
        <span className={`text-stone-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>›</span>
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  )
}

export function Field({ label, hint, children, group }: { label: string; hint?: ReactNode; children: ReactNode; group?: boolean }) {
  const inner = (
    <>
      <span className="mb-1 block text-xs font-medium text-stone-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-stone-500">{hint}</span>}
    </>
  )
  // Groups of buttons must not sit inside a <label> (it would rename every button).
  return group ? <div className="block" role="group" aria-label={label}>{inner}</div> : <label className="block">{inner}</label>
}

const inputCls =
  'w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 shadow-sm focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/20 disabled:bg-stone-100 disabled:text-stone-400'

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
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400">{suffix}</span>}
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
    <label className={`flex items-start gap-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-red-700" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm text-stone-800">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-stone-500">{hint}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex w-full rounded-md border border-stone-300 bg-stone-100 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${value === o.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function FileButton({ accept, multiple, onFiles, children, variant = 'secondary', directory }: {
  accept?: string; multiple?: boolean; onFiles: (f: File[]) => void; children: ReactNode; variant?: 'primary' | 'secondary'; directory?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className={btnCls(variant)} onClick={() => ref.current?.click()}>{children}</button>
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
      className={`rounded-lg border-2 border-dashed p-3 text-center text-xs transition ${over ? 'border-red-600 bg-red-50' : 'border-stone-300 bg-stone-50'}`}
    >
      {children}
    </div>
  )
}

export const btnCls = (variant: 'primary' | 'secondary' | 'ghost' = 'secondary') =>
  ({
    primary: 'inline-flex items-center justify-center gap-1.5 rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-stone-300',
    secondary: 'inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50',
    ghost: 'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40',
  })[variant]

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'error' | 'ok' | 'info'; children: ReactNode }) {
  const c = {
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-red-300 bg-red-50 text-red-900',
    ok: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
  }[tone]
  return <div className={`rounded-md border px-2.5 py-1.5 text-xs leading-snug ${c}`}>{children}</div>
}

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { initials } from '../lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-strong shadow-[0_8px_30px_-10px_rgba(245,181,68,0.6)]',
  secondary: 'bg-surface-2 text-text hover:bg-surface-3 border border-line',
  ghost: 'text-muted hover:text-text hover:bg-white/5',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  )
}

export function IconButton({
  label,
  active,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40 ${
        active ? 'bg-accent/15 text-accent' : 'text-text/85 hover:bg-white/10 hover:text-text'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Avatar({
  name,
  color,
  size = 36,
  speaking = false,
  dim = false,
}: {
  name: string
  color: string
  size?: number
  speaking?: boolean
  dim?: boolean
}) {
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-accent-ink ${speaking ? 'speaking' : ''} ${dim ? 'opacity-40 grayscale' : ''}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warn' }) {
  const tones = {
    neutral: 'bg-white/8 text-muted',
    accent: 'bg-accent/15 text-accent',
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-danger/15 text-danger',
  }
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-white/20 border-t-accent"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Загрузка"
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-text">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'h-11 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-sm text-text placeholder:text-faint outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20'

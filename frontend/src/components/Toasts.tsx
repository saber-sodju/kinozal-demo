import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertIcon, CheckIcon } from './Icons'

type Tone = 'info' | 'error' | 'ok'
interface Toast {
  id: number
  text: string
  tone: Tone
}

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((text: string, tone: Tone = 'info') => {
    const id = nextId++
    setToasts((t) => [...t.filter((x) => x.text !== text).slice(-3), { id, text, tone }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pop-in pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${
              t.tone === 'error'
                ? 'border-danger/30 bg-[#2a1416]/95 text-[#ffd9da]'
                : t.tone === 'ok'
                  ? 'border-ok/30 bg-[#11241b]/95 text-[#d4f5e4]'
                  : 'border-white/10 bg-surface-2/90 text-text'
            }`}
          >
            {t.tone === 'error' ? <AlertIcon size={18} className="mt-px shrink-0" /> : t.tone === 'ok' ? <CheckIcon size={18} className="mt-px shrink-0" /> : null}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

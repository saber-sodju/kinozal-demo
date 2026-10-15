import { useEffect, type ReactNode } from 'react'
import { CloseIcon } from './Icons'

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fade-in fixed inset-0 z-[90] flex items-end justify-center bg-[#03030a]/75 p-0 backdrop-blur-md sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`pop-in max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-surface/95 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-text" aria-label="Закрыть">
            <CloseIcon size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

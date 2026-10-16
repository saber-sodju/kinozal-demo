import { useEffect, useRef, useState } from 'react'
import { ChatIcon, CloseIcon } from '../components/Icons'
import type { ChatMessage } from '../lib/types'
import { ChatInput, MessageList } from './ChatPanel'

/**
 * Чат в полноэкранном режиме: кнопка со счётчиком новых сообщений, полупрозрачная панель
 * поверх видео, а при закрытой панели — всплывающие сообщения слева внизу.
 */
export function FsChat({
  messages,
  you,
  onSend,
  onOpenChange,
}: {
  messages: ChatMessage[]
  you: string | null
  onSend: (body: string) => boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpenState] = useState(false)
  const setOpen = (v: boolean) => {
    setOpenState(v)
    onOpenChange?.(v)
  }
  const [seen, setSeen] = useState(messages.length)
  const [toasts, setToasts] = useState<ChatMessage[]>([])
  const last = messages[messages.length - 1]
  const lastId = useRef(last?.id ?? 0)

  useEffect(() => {
    if (open) setSeen(messages.length)
  }, [open, messages.length])

  // Новые сообщения всплывают поверх видео, пока панель закрыта.
  useEffect(() => {
    if (!last || last.id === lastId.current) return
    lastId.current = last.id
    if (open) return
    setToasts((t) => [...t.slice(-2), last])
    const timer = window.setTimeout(() => setToasts((t) => t.filter((m) => m.id !== last.id)), 6000)
    return () => window.clearTimeout(timer)
  }, [last, open])

  const unread = Math.max(0, messages.filter((m) => m.kind === 'text').length - messages.slice(0, seen).filter((m) => m.kind === 'text').length)

  return (
    <>
      {!open && toasts.length > 0 && (
        <div className="pointer-events-none absolute bottom-32 left-3 z-40 flex max-w-[min(24rem,70vw)] flex-col gap-1.5 sm:left-4">
          {toasts.map((m) => (
            <div key={m.id} className="pop-in rounded-2xl bg-black/65 px-3 py-1.5 text-sm text-white backdrop-blur-md">
              {m.kind === 'system' ? (
                <span className="text-white/60">{m.body}</span>
              ) : (
                <>
                  <span className="font-semibold" style={{ color: m.author_color ?? undefined }}>
                    {m.author_name}:{' '}
                  </span>
                  {m.body}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Открыть чат"
          className="btn-press absolute right-3 top-3 z-40 flex h-11 items-center gap-2 rounded-full bg-black/60 px-4 text-sm font-semibold text-white backdrop-blur-md hover:bg-black/75 sm:right-4 sm:top-4"
        >
          <ChatIcon size={18} /> Чат
          {unread > 0 && <span className="bg-brand min-w-5 rounded-full px-1.5 text-center text-xs font-bold">{unread}</span>}
        </button>
      )}

      {open && (
        <div className="pop-in absolute z-40 flex flex-col overflow-hidden border border-white/10 bg-[#07070f]/75 text-white shadow-2xl backdrop-blur-xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:h-[52%] max-sm:rounded-t-3xl sm:bottom-20 sm:right-4 sm:top-4 sm:w-[min(22rem,calc(100%-2rem))] sm:rounded-3xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ChatIcon size={17} /> Чат
            </span>
            <button onClick={() => setOpen(false)} aria-label="Закрыть чат" className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
              <CloseIcon size={18} />
            </button>
          </div>
          <MessageList messages={messages} you={you} dark />
          <div className="p-2.5 max-sm:pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <ChatInput onSend={onSend} dark />
          </div>
        </div>
      )}
    </>
  )
}

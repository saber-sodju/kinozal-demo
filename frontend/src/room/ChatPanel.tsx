import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Avatar } from '../components/ui'
import { formatClock } from '../lib/format'
import type { ChatMessage } from '../lib/types'

/** Поле ввода как в мессенджерах: растёт по тексту, Enter — отправить, Shift+Enter — новая строка. */
export function ChatInput({
  onSend,
  inputRef,
  dark = false,
}: {
  onSend: (body: string) => boolean
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  dark?: boolean
}) {
  const [text, setText] = useState('')
  const own = useRef<HTMLTextAreaElement>(null)
  const ref = inputRef ?? own
  const hasText = text.trim().length > 0

  // Высота поля подстраивается под текст (до ~5 строк).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [text, ref])

  function send() {
    const body = text.trim()
    if (!body) return
    if (onSend(body)) setText('')
    ref.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div
      className={`flex items-end gap-1.5 rounded-[24px] border py-1.5 pl-4 pr-1.5 transition focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/15 ${
        dark ? 'border-white/15 bg-black/50 backdrop-blur-md' : 'border-white/10 bg-white/[0.05]'
      }`}
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        enterKeyHint="send"
        placeholder="Сообщение…"
        aria-label="Сообщение"
        className="max-h-[132px] min-h-[36px] min-w-0 flex-1 resize-none bg-transparent focus-visible:outline-none py-[7px] text-[15px] leading-[22px] text-text outline-none placeholder:text-faint"
      />
      <button
        type="button"
        onClick={send}
        // Как в мессенджерах: нажатие не забирает фокус у поля, клавиатура не закрывается.
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        disabled={!hasText}
        aria-label="Отправить"
        title="Отправить (Enter)"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition duration-200 ease-out ${
          hasText ? 'bg-brand scale-100 shadow-[0_4px_16px_-4px_rgba(61,107,255,0.9)] active:scale-90' : 'scale-90 bg-white/10 text-white/40'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
        </svg>
      </button>
    </div>
  )
}

/** Лента сообщений; прилипает к низу, пока пользователь не пролистал вверх. */
export function MessageList({ messages, you, dark = false }: { messages: ChatMessage[]; you: string | null; dark?: boolean }) {
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div
      ref={listRef}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      }}
      className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3"
      aria-live="polite"
      aria-label="Сообщения чата"
    >
      {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">Здесь пока тихо. Напиши первым!</p>}
      {messages.map((m, i) => {
        if (m.kind === 'system') {
          return (
            <p key={m.id} className={`py-1 text-center text-xs ${dark ? 'text-white/50' : 'text-faint'}`}>
              {m.body}
            </p>
          )
        }
        const prev = messages[i - 1]
        const grouped = prev && prev.kind === 'text' && prev.author_id === m.author_id && m.created_at - prev.created_at < 120000
        const mine = m.author_id === you
        return (
          <div key={m.id} className={`fade-in flex gap-2.5 ${grouped ? '' : 'pt-2'}`}>
            <div className="w-8 shrink-0">{!grouped && <Avatar name={m.author_name ?? '?'} color={m.author_color ?? '#888'} size={32} />}</div>
            <div className="min-w-0 flex-1">
              {!grouped && (
                <p className="flex items-baseline gap-2 text-sm">
                  <span className="font-semibold" style={{ color: m.author_color ?? undefined }}>
                    {m.author_name}
                    {mine && <span className="ml-1 font-normal text-faint">(ты)</span>}
                  </span>
                  <span className="text-[11px] text-faint">{formatClock(m.created_at)}</span>
                </p>
              )}
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text/90">{m.body}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ChatPanel({
  messages,
  you,
  onSend,
  inputRef,
}: {
  messages: ChatMessage[]
  you: string | null
  onSend: (body: string) => boolean
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageList messages={messages} you={you} />
      {/* снизу — отступ под полоску «домой» на iPhone */}
      <div className="border-t border-white/5 p-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <ChatInput onSend={onSend} inputRef={inputRef} />
      </div>
    </div>
  )
}

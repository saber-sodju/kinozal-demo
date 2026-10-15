import { useConfig } from '../lib/useConfig'

/** Подсказка про бота для больших фильмов из Telegram (если бот настроен на сервере). */
export function TgBotHint({ className = '' }: { className?: string }) {
  const config = useConfig()
  if (!config?.tg_bot) return null
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-[#2AABEE]/25 bg-[#2AABEE]/8 p-3.5 text-sm ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" className="mt-px shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="12" fill="#2AABEE" />
        <path d="M5.4 11.8 16.9 7.4c.5-.2 1 .1.8.9l-2 9.3c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.3-.1l-6.7 4.2-2.9-.9c-.6-.2-.6-.6.1-.9z" fill="#fff" />
      </svg>
      <p className="text-text/90">
        <span className="font-semibold">Большой фильм из Telegram?</span> Перешли его боту{' '}
        <a href={`https://t.me/${config.tg_bot}`} target="_blank" rel="noreferrer" className="font-semibold text-[#5CC3F5] hover:underline">
          @{config.tg_bot}
        </a>{' '}
        — он создаст комнату и пришлёт ссылку. Работает и с закрытыми каналами.
      </p>
    </div>
  )
}

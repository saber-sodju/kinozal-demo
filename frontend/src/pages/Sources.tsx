import { useEffect, useState } from 'react'
import { AlertIcon, CheckIcon, CloseIcon } from '../components/Icons'
import { LinkChecker } from '../components/MediaPicker'
import { TgBotHint } from '../components/TgBotHint'
import { Spinner } from '../components/ui'
import { api } from '../lib/api'
import type { SourceInfo } from '../lib/types'

const UNSUPPORTED = [
  ['Netflix, Disney+, Prime Video, Кинопоиск и др.', 'Видео защищено DRM и не встраивается на другие сайты.'],
  ['Демонстрация экрана', 'Защищённое видео показывается чёрным экраном, а пересылка чужого видео — это его распространение.'],
  ['Сайты без официального плеера', 'Нельзя управлять воспроизведением — значит, нельзя синхронизировать.'],
]

export function SourcesPage() {
  const [sources, setSources] = useState<SourceInfo[] | null>(null)
  useEffect(() => {
    api<{ sources: SourceInfo[] }>('/api/sources').then((d) => setSources(d.sources)).catch(() => setSources([]))
  }, [])

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Источники</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Мы не храним и не пересылаем видео — каждый зритель смотрит его напрямую с источника, а Kinora синхронизирует плееры. Поэтому работает только то, что источник разрешает встраивать.
      </p>

      <section className="mt-8 rounded-2xl border border-white/5 bg-surface p-6">
        <h2 className="mb-1 text-lg font-semibold">Проверить ссылку</h2>
        <p className="mb-4 text-sm text-muted">Вставь ссылку — покажем, получится ли посмотреть её вместе.</p>
        <LinkChecker />
        <TgBotHint className="mt-4" />
      </section>

      <h2 className="mt-12 font-display text-2xl font-bold">Поддерживается</h2>
      {sources === null ? (
        <div className="py-10"><Spinner /></div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {sources.map((s) => (
            <article key={s.id} className="rounded-2xl border border-white/5 bg-surface p-6">
              <h3 className="text-lg font-semibold">{s.name}</h3>
              <p className="mt-1 break-all font-mono text-xs text-faint">{s.examples.join('  ·  ')}</p>
              <ul className="mt-4 space-y-1.5 text-sm">
                <Cap ok text="Синхронизация play / пауза / перемотка" />
                <Cap ok={s.capabilities.can_set_rate} text={s.capabilities.can_set_rate ? 'Плавный догон без рывков' : 'Догон рывками (без плавной скорости)'} />
                <Cap ok={!s.capabilities.may_have_ads} text={s.capabilities.may_have_ads ? 'Может быть реклама' : 'Без рекламы'} />
                <Cap ok={!s.capabilities.needs_auth} text={s.capabilities.needs_auth ? 'Нужен вход в аккаунт' : 'Вход не нужен'} />
              </ul>
              <ul className="mt-4 space-y-1.5 border-t border-white/5 pt-4 text-sm text-muted">
                {s.notes.map((n) => <li key={n}>— {n}</li>)}
              </ul>
            </article>
          ))}
        </div>
      )}

      <h2 className="mt-12 font-display text-2xl font-bold">Не поддерживается</h2>
      <div className="mt-5 grid gap-3">
        {UNSUPPORTED.map(([t, d]) => (
          <div key={t} className="flex gap-3 rounded-xl border border-white/5 bg-surface p-4">
            <CloseIcon size={18} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="font-semibold">{t}</p>
              <p className="mt-0.5 text-sm text-muted">{d}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Cap({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckIcon size={16} className="mt-0.5 shrink-0 text-ok" /> : <AlertIcon size={16} className="mt-0.5 shrink-0 text-accent" />}
      {text}
    </li>
  )
}

import { Link } from 'react-router'
import { CheckIcon } from '../components/Icons'
import { Reveal } from '../components/Motion'

const STEPS = [
  { t: 'Скачай архив', d: 'Нажми «Скачать расширение» и распакуй архив в любую папку (например, «Документы»).' },
  { t: 'Открой страницу расширений', d: 'В адресной строке набери chrome://extensions (в Яндекс Браузере — browser://extensions, в Edge — edge://extensions).' },
  { t: 'Включи «Режим разработчика»', d: 'Переключатель справа вверху страницы расширений.' },
  { t: 'Загрузи расширение', d: 'Нажми «Загрузить распакованное» и выбери папку kinora-extension из архива. Значок Kinora появится рядом с адресной строкой (закрепи его кнопкой-пазлом).' },
]

const HOW = [
  'Открой фильм на любом сайте и нажми на значок Kinora.',
  'Нажми «Создать комнату для этой вкладки» — ссылка скопируется сама.',
  'Отправь ссылку друзьям: им нужно поставить расширение, открыть ту же страницу и вставить ссылку → «Подключить эту вкладку».',
  'Пауза и перемотка теперь у всех одновременно. Чат и голос — в комнате на сайте.',
]

export function ExtensionPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <img src="/logo-mark.png" alt="" className="float h-20 w-20" />
        <div>
          <h1 className="font-display text-4xl font-extrabold sm:text-5xl">
            Смотри вместе <span className="text-gradient">с любого сайта</span>
          </h1>
          <p className="mt-3 max-w-2xl text-muted">
            Расширение Kinora синхронизирует видео прямо на сайте, где ты смотришь: у каждого своё качество, а пауза и перемотка — общие.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a
          href="/kinora-extension.zip"
          download
          className="btn-press btn-sheen glow-brand bg-brand inline-flex h-12 items-center rounded-2xl px-6 font-semibold text-white"
        >
          Скачать расширение
        </a>
        <span className="text-sm text-muted">Для Chrome, Edge, Яндекс Браузера, Opera · на компьютере</span>
      </div>

      <Reveal>
        <h2 className="mt-14 font-display text-2xl font-extrabold">Установка — 1 минута</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.t} className="rounded-2xl border border-white/[0.07] bg-surface/60 p-5 backdrop-blur-xl">
              <span className="bg-brand flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold text-white">{i + 1}</span>
              <p className="mt-3 font-semibold">{s.t}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal delay={80}>
        <h2 className="mt-14 font-display text-2xl font-extrabold">Как смотреть</h2>
        <ul className="mt-5 space-y-3">
          {HOW.map((t) => (
            <li key={t} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <CheckIcon size={14} />
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={120}>
        <div className="mt-14 rounded-3xl border border-white/[0.07] bg-gradient-soft p-6">
          <p className="font-semibold">Нет компьютера под рукой или друг с телефона?</p>
          <p className="mt-1 text-sm text-muted">
            В комнате нажми «Показать вкладку» — друзья увидят твою вкладку прямо на сайте, расширение им не нужно.{' '}
            <Link to="/new" className="font-semibold text-accent hover:text-accent-strong">
              Создать комнату →
            </Link>
          </p>
        </div>
      </Reveal>
    </div>
  )
}

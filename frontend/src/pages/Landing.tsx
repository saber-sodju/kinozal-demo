import { Link } from 'react-router'
import { useCatalogSearch } from '../components/MediaPicker'
import { PosterCard } from '../components/PosterCard'
import { ChatIcon, HeadphonesIcon, LinkIcon, PlayIcon } from '../components/Icons'

const STEPS = [
  { icon: LinkIcon, title: 'Создай комнату', text: 'Выбери фильм из каталога или вставь ссылку на YouTube, Vimeo, Internet Archive.' },
  { icon: ChatIcon, title: 'Отправь ссылку друзьям', text: 'Без регистрации и расширений: открыл ссылку, ввёл имя — и ты в зале.' },
  { icon: HeadphonesIcon, title: 'Смотрите вместе', text: 'Видео идёт синхронно у всех, а голос и чат — прямо поверх фильма.' },
]

const REACTIONS = [
  { e: '😂', x: '12%', d: '0s' },
  { e: '🔥', x: '30%', d: '1.1s' },
  { e: '😮', x: '68%', d: '0.5s' },
  { e: '👏', x: '84%', d: '1.7s' },
]

function HeroScene() {
  const people = [
    { n: 'А', c: '#F5B544', speaking: true },
    { n: 'Д', c: '#7FB2FF' },
    { n: 'М', c: '#FF7A6B' },
    { n: 'С', c: '#7AD3A8' },
  ]
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-hidden>
      <div className="absolute -inset-10 rounded-[40px] bg-accent/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl">
        <div className="relative aspect-video overflow-hidden bg-black">
          <img src="https://archive.org/services/img/his_girl_friday" alt="" className="h-full w-full scale-110 object-cover opacity-55 blur-[1px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
          {REACTIONS.map((r) => (
            <span key={r.e} className="reaction-float absolute bottom-6 text-3xl" style={{ left: r.x, animationDelay: r.d, animationIterationCount: 'infinite', animationDuration: '3.2s' }}>
              {r.e}
            </span>
          ))}
          <div className="absolute inset-x-4 bottom-3 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 backdrop-blur"><PlayIcon size={14} /></span>
            <div className="h-1 flex-1 rounded-full bg-white/20"><div className="h-full w-2/5 rounded-full bg-accent" /></div>
            <span className="text-xs text-white/80">38:12</span>
          </div>
          <div className="absolute right-3 top-3 rounded-lg bg-black/50 px-2 py-1 text-xs text-ok backdrop-blur">● синхронно</div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex -space-x-2">
            {people.map((p) => (
              <span key={p.n} className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface text-sm font-bold text-accent-ink ${p.speaking ? 'speaking' : ''}`} style={{ background: p.c }}>
                {p.n}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
            <span className="font-semibold text-[#7FB2FF]">Дима:</span> вот это поворот 😂
          </div>
        </div>
      </div>
    </div>
  )
}

export function LandingPage() {
  const { items } = useCatalogSearch('')
  return (
    <div>
      <section className="film-grain relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              Без регистрации · без расширений
            </p>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Кино вместе,
              <br />
              <span className="text-accent">даже когда далеко</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
              Открой ссылку, и через полминуты вы вместе смотрите фильм, слышите друг друга и смеётесь в одних и тех же местах.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/new" className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-accent-ink shadow-[0_10px_40px_-10px_rgba(245,181,68,0.7)] transition hover:bg-accent-strong">
                <PlayIcon size={16} /> Создать комнату
              </Link>
              <Link to="/catalog" className="inline-flex h-12 items-center rounded-xl border border-line bg-surface-2 px-6 font-semibold transition hover:bg-surface-3">
                Открыть каталог
              </Link>
            </div>
          </div>
          <HeroScene />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-3xl font-bold">Как это работает</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-white/5 bg-surface p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/12 text-accent"><s.icon size={20} /></span>
                <span className="font-display text-sm text-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold">Сейчас в каталоге</h2>
            <p className="mt-2 text-muted">Классика и открытое кино — всё точно запускается.</p>
          </div>
          <Link to="/catalog" className="shrink-0 text-sm font-semibold text-accent hover:text-accent-strong">Весь каталог →</Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {(items ?? []).slice(0, 6).map((item) => <PosterCard key={item.id} item={item} />)}
          {items === null && Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-surface-2" />)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 rounded-3xl border border-white/5 bg-surface p-8 md:grid-cols-[1fr_1.2fr] md:p-10">
          <div>
            <h2 className="font-display text-2xl font-bold">Почему здесь нет Netflix?</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Стриминги защищают видео (DRM) и не дают встраивать его на другие сайты. Мы показываем только то, что можно легально воспроизвести, — зато оно действительно работает у всех.
            </p>
            <Link to="/sources" className="mt-5 inline-block text-sm font-semibold text-accent hover:text-accent-strong">Все источники и ограничения →</Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              ['YouTube', 'Любое видео, где разрешено встраивание'],
              ['Internet Archive', 'Тысячи классических фильмов'],
              ['Vimeo', 'Инди-кино и короткий метр'],
              ['Ссылка на файл', '.mp4, .webm и HLS-потоки'],
            ].map(([t, d]) => (
              <li key={t} className="rounded-xl bg-surface-2 p-4">
                <p className="font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

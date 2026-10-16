import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChatIcon, CheckIcon, HeadphonesIcon, LinkIcon, PlayIcon, SearchIcon, UsersIcon } from '../components/Icons'
import { useCatalogSearch } from '../components/MediaPicker'
import { Reveal } from '../components/Motion'
import { Poster, PosterCard } from '../components/PosterCard'
import { SourceTile } from '../components/SourceIcons'
import type { CatalogItem } from '../lib/types'

const STEPS = [
  { icon: LinkIcon, title: 'Создай комнату', text: 'Выбери фильм из каталога или вставь ссылку на YouTube, VK Видео, Telegram или Vimeo.' },
  { icon: UsersIcon, title: 'Позови друзей', text: 'Отправь ссылку. Ни регистрации, ни расширений — открыл, ввёл имя и ты в зале.' },
  { icon: PlayIcon, title: 'Смотрите вместе', text: 'Пауза, перемотка и реакции — у всех одновременно, а голос и чат прямо поверх фильма.' },
]

const SOURCES = [
  { id: 'rutube', name: 'Rutube' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'vk', name: 'VK Видео' },
  { id: 'telegram', name: 'Telegram' },
  { id: 'vimeo', name: 'Vimeo' },
  { id: 'archive', name: 'Internet Archive' },
  { id: 'direct', name: 'Файлы .mp4 / HLS' },
]

const PEOPLE = [
  { n: 'А', c: '#5CC8FF', speaking: true },
  { n: 'Д', c: '#B48CFF' },
  { n: 'М', c: '#F08BD8' },
  { n: 'С', c: '#5EE0B0' },
]

function HeroScene() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none" aria-hidden>
      <div className="absolute -inset-8 rounded-[48px] bg-[radial-gradient(closest-side,rgba(61,107,255,0.35),transparent)] blur-2xl" />

      <div className="ring-spin relative rounded-[22px] p-[1.5px] shadow-[0_30px_80px_-20px_rgba(20,30,90,0.9)]">
        <div className="overflow-hidden rounded-[21px] bg-surface">
          <div className="relative aspect-video overflow-hidden bg-black">
            <img src="https://archive.org/services/img/his_girl_friday" alt="" className="h-full w-full scale-110 object-cover opacity-50" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,15,0.15),rgba(7,7,15,0.1)_40%,rgba(7,7,15,0.9))]" />
            {['😂', '🔥', '😮', '👏'].map((e, i) => (
              <span
                key={e}
                className="reaction-float absolute bottom-10 text-3xl"
                style={{ left: `${14 + i * 22}%`, animationDelay: `${i * 0.8}s`, animationIterationCount: 'infinite', animationDuration: '3.4s' }}
              >
                {e}
              </span>
            ))}
            <div className="absolute inset-x-4 bottom-3 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                <PlayIcon size={13} />
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                <div className="h-full w-[42%] rounded-full bg-[linear-gradient(90deg,#38c8ff,#6e8bff,#a855f7)]" />
              </div>
              <span className="text-xs tabular-nums text-white/80">38:12</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex -space-x-2">
              {PEOPLE.map((p) => (
                <span
                  key={p.n}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface text-sm font-bold text-[#0b0b18] ${p.speaking ? 'speaking' : ''}`}
                  style={{ background: p.c }}
                >
                  {p.n}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1 rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-muted">
              <span className="font-semibold text-[#B48CFF]">Дима:</span> вот это поворот 😂
            </div>
          </div>
        </div>
      </div>

      {/* Плавающие карточки */}
      <div className="float glass absolute -left-3 top-8 hidden items-center gap-2 rounded-2xl border border-white/10 px-3.5 py-2.5 text-sm shadow-2xl sm:flex">
        <span className="live-dot h-2 w-2 rounded-full bg-ok" />
        <span className="font-semibold">Синхронно</span>
        <span className="text-muted">± 0.1 с</span>
      </div>
      <div className="float-slow glass absolute -bottom-14 right-4 hidden items-center gap-2.5 rounded-2xl border border-white/10 px-3.5 py-2.5 text-sm shadow-2xl sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
          <HeadphonesIcon size={15} />
        </span>
        <span>
          <span className="block font-semibold leading-tight">Голос включён</span>
          <span className="block text-xs text-muted">фильм тише, пока говорят</span>
        </span>
      </div>
    </div>
  )
}

function PosterMarquee({ items }: { items: CatalogItem[] }) {
  if (items.length < 6) return null
  const half = Math.ceil(items.length / 2)
  const rows = [items.slice(0, half), items.slice(half)]
  return (
    <div className="marquee space-y-4 py-2" aria-hidden>
      {rows.map((row, r) => (
        <div key={r} className={`marquee-track gap-4 ${r ? 'reverse' : ''}`}>
          {[...row, ...row].map((it, i) => (
            <Link
              key={`${it.id}-${i}`}
              to={`/film/${it.id}`}
              tabIndex={-1}
              className="group relative block w-32 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:ring-accent/60 sm:w-36"
            >
              <Poster src={it.poster_url} title={it.title} className="aspect-[2/3] w-full transition duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 transition group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}

function HeroSearch() {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        navigate(`/search?q=${encodeURIComponent(q.trim())}`)
      }}
      className="group relative mt-8 max-w-xl"
    >
      <div className="absolute -inset-px rounded-2xl bg-[linear-gradient(90deg,rgba(56,200,255,0.6),rgba(61,107,255,0.6),rgba(168,85,247,0.6))] opacity-50 blur-[2px] transition group-focus-within:opacity-100" />
      <div className="relative flex items-center rounded-2xl bg-surface/90 backdrop-blur-xl">
        <SearchIcon size={20} className="pointer-events-none ml-4 shrink-0 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найди фильм, аниме или дораму…"
          aria-label="Поиск фильмов, аниме и дорам"
          className="h-14 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-faint"
        />
        <button type="submit" className="btn-press bg-brand mr-2 h-10 shrink-0 rounded-xl px-4 text-sm font-semibold text-white hover:brightness-110">
          Найти
        </button>
      </div>
    </form>
  )
}

export function LandingPage() {
  const { items } = useCatalogSearch('')

  return (
    <div className="overflow-x-clip">
      {/* ---------- Hero ---------- */}
      <section className="relative">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.02fr_1fr] lg:pb-24 lg:pt-20">
          <div>
            <p className="pop-in inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-muted backdrop-blur">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-ok" />
              Без регистрации · без расширений · бесплатно
            </p>
            <h1 className="pop-in mt-6 font-display text-[42px] font-extrabold leading-[1.04] sm:text-6xl lg:text-7xl" style={{ animationDelay: '60ms' }}>
              Кино вместе,
              <br />
              <span className="text-gradient">даже когда далеко</span>
            </h1>
            <p className="pop-in mt-6 max-w-lg text-lg leading-relaxed text-muted" style={{ animationDelay: '120ms' }}>
              Открой ссылку — и через полминуты вы вместе смотрите фильм, слышите друг друга и смеётесь в одних и тех же местах.
            </p>
            <div className="pop-in" style={{ animationDelay: '160ms' }}>
              <HeroSearch />
            </div>
            <div className="pop-in mt-6 flex flex-wrap gap-3" style={{ animationDelay: '200ms' }}>
              <Link
                to="/new"
                className="btn-press btn-sheen glow-brand bg-brand inline-flex h-13 items-center gap-2.5 rounded-2xl px-7 text-base font-semibold text-white hover:brightness-110"
              >
                <PlayIcon size={16} /> Создать комнату
              </Link>
              <Link
                to="/catalog"
                className="btn-press inline-flex h-13 items-center rounded-2xl border border-white/10 bg-white/[0.04] px-7 text-base font-semibold backdrop-blur hover:bg-white/[0.08]"
              >
                Открыть каталог
              </Link>
            </div>
            <ul className="pop-in mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted" style={{ animationDelay: '240ms' }}>
              {['Синхронно у всех', 'Голос и чат', 'Rutube, YouTube, VK, Telegram'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <CheckIcon size={13} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="pop-in" style={{ animationDelay: '150ms' }}>
            <HeroScene />
          </div>
        </div>
      </section>

      {/* ---------- Лента постеров ---------- */}
      <section className="pb-8">
        <PosterMarquee items={items ?? []} />
      </section>

      {/* ---------- Как это работает ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Как это работает</p>
          <h2 className="mt-3 max-w-xl font-display text-3xl font-extrabold sm:text-4xl">Три шага — и вы на одном диване</h2>
        </Reveal>
        <div className="relative mt-12 grid gap-5 md:grid-cols-3">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-[38px] hidden h-px bg-[linear-gradient(90deg,transparent,rgba(110,139,255,0.5),rgba(168,85,247,0.5),transparent)] md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 110}>
              <div className="group relative h-full rounded-3xl border border-white/[0.07] bg-surface/60 p-7 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-accent/40">
                <div className="flex items-center justify-between">
                  <span className="glow-brand bg-brand flex h-12 w-12 items-center justify-center rounded-2xl text-white transition duration-300 group-hover:scale-110">
                    <s.icon size={22} />
                  </span>
                  <span className="font-display text-4xl font-extrabold text-white/[0.07]">0{i + 1}</span>
                </div>
                <h3 className="mt-6 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Возможности ---------- */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <div className="relative h-full overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-soft p-8">
              <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet/30 blur-3xl" />
              <h3 className="relative font-display text-2xl font-extrabold">Синхронно до долей секунды</h3>
              <p className="relative mt-2 max-w-md text-muted">
                Кто-то нажал паузу — пауза у всех. Опоздавший друг сам догоняет остальных, а после обрыва связи всё продолжается с того же места.
              </p>
              <div className="relative mt-8 space-y-3">
                {[
                  { n: 'Аня', c: '#5CC8FF', w: '64%' },
                  { n: 'Дима', c: '#B48CFF', w: '64%' },
                  { n: 'Марат', c: '#F08BD8', w: '63%' },
                ].map((r) => (
                  <div key={r.n} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 text-muted">{r.n}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,#38c8ff,#6e8bff,#a855f7)]" style={{ width: r.w }} />
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.c }} />
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="h-full rounded-3xl border border-white/[0.07] bg-surface/60 p-8 backdrop-blur-xl">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <HeadphonesIcon size={22} />
              </span>
              <h3 className="mt-5 font-display text-xl font-extrabold">Голос как в зале</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                До 6 человек в голосе. Пока кто-то говорит, фильм сам становится тише — слышно и друзей, и кино.
              </p>
            </div>
          </Reveal>
          <Reveal delay={60}>
            <div className="h-full rounded-3xl border border-white/[0.07] bg-surface/60 p-8 backdrop-blur-xl">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <ChatIcon size={22} />
              </span>
              <h3 className="mt-5 font-display text-xl font-extrabold">Чат и реакции</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">Реакции всплывают прямо на видео, а сообщения видно даже во весь экран.</p>
            </div>
          </Reveal>
          <Reveal delay={140} className="lg:col-span-2">
            <div className="h-full rounded-3xl border border-white/[0.07] bg-surface/60 p-8 backdrop-blur-xl">
              <h3 className="font-display text-xl font-extrabold">Смотри откуда угодно</h3>
              <p className="mt-2 text-sm text-muted">Вставь ссылку — Kinora сама проверит, получится ли посмотреть её вместе.</p>
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {SOURCES.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 transition hover:bg-white/[0.07]">
                    <SourceTile id={s.id} size={34} />
                    <span className="text-sm font-semibold">{s.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Каталог ---------- */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <Reveal>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-extrabold">Сейчас в каталоге</h2>
              <p className="mt-2 text-muted">Классика и открытое кино — всё точно запускается.</p>
            </div>
            <Link to="/catalog" className="shrink-0 text-sm font-semibold text-accent transition hover:text-accent-strong">
              Весь каталог →
            </Link>
          </div>
        </Reveal>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {(items ?? []).slice(0, 6).map((item, i) => (
            <Reveal key={item.id} delay={i * 60}>
              <PosterCard item={item} />
            </Reveal>
          ))}
          {items === null && Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-surface-2" />)}
        </div>
      </section>

      {/* ---------- Призыв ---------- */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 px-8 py-14 text-center sm:px-16">
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(29,111,232,0.45),rgba(59,85,240,0.35)_45%,rgba(124,58,237,0.5))]" />
            <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-cyan/30 blur-3xl" />
            <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-violet/40 blur-3xl" />
            <div className="relative">
              <img src="/logo-mark.png" alt="" className="float mx-auto h-16 w-16" />
              <h2 className="mt-5 font-display text-3xl font-extrabold sm:text-4xl">Сегодня вечером — кино вместе?</h2>
              <p className="mx-auto mt-3 max-w-md text-white/75">Создай комнату за 10 секунд и отправь ссылку друзьям.</p>
              <Link
                to="/new"
                className="btn-press btn-sheen mt-8 inline-flex h-13 items-center gap-2.5 rounded-2xl bg-white px-8 text-base font-bold text-[#1b1f4a] shadow-[0_12px_40px_-10px_rgba(255,255,255,0.5)] hover:bg-white/90"
              >
                <PlayIcon size={16} /> Создать комнату
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  )
}

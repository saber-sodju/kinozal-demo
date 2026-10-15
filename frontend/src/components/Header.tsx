import { Link, NavLink } from 'react-router'
import { useSession } from '../lib/useSession'
import { Avatar } from './ui'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`} aria-label="Kinora — на главную">
      <img src="/logo-mark.png" alt="" width={34} height={34} className="h-[34px] w-[34px] shrink-0" />
      <span className="font-brand text-[22px] font-bold leading-none tracking-tight">
        K<span className="bg-gradient-to-r from-[#5cc8ff] via-[#3d7bff] to-[#a855f7] bg-clip-text text-transparent">inora</span>
      </span>
    </Link>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'text-text' : 'text-muted hover:text-text'}`

export function Header() {
  const session = useSession()
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Основная навигация">
          <NavLink to="/catalog" className={navClass}>Каталог</NavLink>
          <NavLink to="/sources" className={navClass}>Источники</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <NavLink to="/catalog" className={(s) => `${navClass(s)} md:hidden`}>Каталог</NavLink>
          <Link
            to="/new"
            className="hidden h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong sm:inline-flex"
          >
            Создать комнату
          </Link>
          <Link to="/settings" className="rounded-full p-1 transition hover:bg-white/5" aria-label="Профиль и настройки">
            {session ? (
              <Avatar name={session.name} color={session.color} size={32} />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-muted">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Kinora — смотрим вместе, даже когда далеко.</p>
        <nav className="flex gap-4" aria-label="Нижняя навигация">
          <Link to="/sources" className="hover:text-text">Источники и ограничения</Link>
          <Link to="/report" className="hover:text-text">Сообщить о нарушении</Link>
        </nav>
      </div>
    </footer>
  )
}

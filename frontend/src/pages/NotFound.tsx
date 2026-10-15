import { Link } from 'react-router'

export function NotFoundPage({ title = 'Такой страницы нет', text = 'Возможно, ссылка устарела.' }: { title?: string; text?: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-28 text-center">
      <p className="font-display text-7xl font-bold text-accent/80">404</p>
      <h1 className="mt-4 font-display text-3xl font-bold">{title}</h1>
      <p className="mt-3 text-muted">{text}</p>
      <Link to="/" className="mt-8 inline-flex h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink hover:bg-accent-strong">
        На главную
      </Link>
    </div>
  )
}

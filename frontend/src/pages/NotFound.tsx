import { Link } from 'react-router'

export function NotFoundPage({ title = 'Такой страницы нет', text = 'Возможно, ссылка устарела.' }: { title?: string; text?: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-28 text-center">
      <p className="text-gradient font-display text-8xl font-extrabold">404</p>
      <h1 className="mt-4 font-display text-3xl font-bold">{title}</h1>
      <p className="mt-3 text-muted">{text}</p>
      <Link to="/" className="btn-press btn-sheen glow-brand bg-brand mt-8 inline-flex h-11 items-center rounded-xl px-5 font-semibold text-white">
        На главную
      </Link>
    </div>
  )
}

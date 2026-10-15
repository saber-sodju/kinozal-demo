import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

/** Фон: медленно плывущие пятна света в цветах логотипа. */
export function Ambient() {
  return (
    <div className="ambient" aria-hidden>
      <span className="b1" />
      <span className="b2" />
      <span className="b3" />
    </div>
  )
}

/** Плавное появление блока, когда он попадает в экран. */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'li' | 'section'
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) {
      el.classList.add('in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag ref={ref as never} className={`reveal ${className}`} style={{ '--delay': `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  )
}

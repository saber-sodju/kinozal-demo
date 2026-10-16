/** Узнаваемые значки источников (упрощённые, без логотипов-копий). */
export function SourceTile({ id, size = 40 }: { id: string; size?: number }) {
  const s = size
  const common = { width: s, height: s, viewBox: '0 0 40 40', 'aria-hidden': true } as const
  switch (id) {
    case 'youtube':
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="11" fill="#FF3B3B" />
          <path d="M16 13.5v13l11-6.5z" fill="#fff" />
        </svg>
      )
    case 'vk':
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="11" fill="#2787F5" />
          <path d="M10 14h4.2c.2 4.6 2.2 6.6 3.8 7v-7h3.9v4c1.6-.2 3.3-2 3.8-4H29c-.6 2.6-2.6 4.6-4 5.4 1.4.7 3.7 2.4 4.5 5.6h-4.3c-.7-2.1-2.4-3.8-4.6-4v4H20c-6.2 0-9.8-4.3-10-11z" fill="#fff" />
        </svg>
      )
    case 'rutube':
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="11" fill="#100943" />
          <path d="M12 12h11.5a5.5 5.5 0 0 1 1.7 10.7L29 28h-5l-3.4-5H17v5h-5zm5 4.2V19h6.2a1.4 1.4 0 0 0 0-2.8z" fill="#fff" />
          <circle cx="29.5" cy="11.5" r="2.5" fill="#ED143B" />
        </svg>
      )
    case 'telegram':
    case 'tgbot':
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="11" fill="#2AABEE" />
          <path d="m9.5 19.6 18.3-7.1c.9-.3 1.6.2 1.3 1.5l-3.1 14.6c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2l-10.6 6.7-4.6-1.4c-1-.3-1-1 .2-1.5z" fill="#fff" />
        </svg>
      )
    case 'vimeo':
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="11" fill="#17B5E8" />
          <path d="M30 15.4c-.1 2.1-1.6 5-4.4 8.6-2.9 3.8-5.4 5.7-7.4 5.7-1.2 0-2.3-1.2-3.2-3.5L13.3 20c-.6-2.3-1.3-3.5-2-3.5-.2 0-.7.3-1.6.9l-.9-1.2 3-2.6c1.3-1.2 2.3-1.8 3-1.8 1.6-.2 2.6.9 2.9 3.2.4 2.5.7 4 .8 4.6.5 2.1 1 3.1 1.5 3.1.4 0 1.1-.7 2-2.1.9-1.4 1.4-2.5 1.5-3.2.1-1.2-.3-1.8-1.5-1.8-.5 0-1.1.1-1.6.3 1.1-3.5 3.1-5.2 6.1-5.1 2.2.1 3.3 1.5 3.2 4.3z" fill="#fff" />
        </svg>
      )
    case 'archive':
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="11" fill="#E8E6E1" />
          <path d="M11 13h18v2.5H11zM12.5 17h2.4v9h-2.4zM18.8 17h2.4v9h-2.4zM25.1 17h2.4v9h-2.4zM11 27.5h18V30H11z" fill="#1E1E1E" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="11" fill="url(#src-grad)" />
          <defs>
            <linearGradient id="src-grad" x1="0" y1="0" x2="40" y2="40">
              <stop stopColor="#38C8FF" />
              <stop offset="1" stopColor="#A855F7" />
            </linearGradient>
          </defs>
          <path d="M13 12h10l5 5v11H13z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M18 19v6l5-3z" fill="#fff" />
        </svg>
      )
  }
}

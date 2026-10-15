import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Spinner } from '../components/ui'

/** Ссылка /tgf/<token> от бота, открытая в браузере → создание комнаты с этим видео. */
export function TgLinkPage() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate(`/new?link=${encodeURIComponent(window.location.href)}`, { replace: true })
  }, [navigate])
  return (
    <div className="flex justify-center py-32">
      <Spinner size={28} />
    </div>
  )
}

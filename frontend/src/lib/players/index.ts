import type { SourceId } from '../types'
import { Html5Player } from './html5'
import { RutubePlayer } from './rutube'
import { VkPlayer } from './vk'
import type { PlayerAdapter } from './types'
import { VimeoPlayer } from './vimeo'
import { YouTubePlayer } from './youtube'

/** Реестр плееров: источник → класс адаптера. */
const REGISTRY: Record<SourceId, () => PlayerAdapter> = {
  youtube: () => new YouTubePlayer(),
  vimeo: () => new VimeoPlayer(),
  vk: () => new VkPlayer(),
  rutube: () => new RutubePlayer(),
  telegram: () => new Html5Player(),
  tgbot: () => new Html5Player(),
  archive: () => new Html5Player(),
  direct: () => new Html5Player(),
  external: () => new Html5Player(), // не используется: видео играет расширение на сайте
}

export function createPlayer(source: SourceId): PlayerAdapter {
  return (REGISTRY[source] ?? REGISTRY.direct)()
}

export type { PlayerAdapter, PlayerEvent } from './types'

import { api } from './api'

export async function createRoom(body: { name?: string; control_mode?: string; catalog_id?: number; url?: string }): Promise<string> {
  const { slug } = await api<{ slug: string }>('/api/rooms', { body })
  return slug
}

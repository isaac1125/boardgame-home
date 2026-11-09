export function youtubeEmbedUrl(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null

  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname.startsWith('/embed/')) {
        return `https://www.youtube.com${u.pathname}`
      }
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube.com/embed/${v}`
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'v') {
        return parts[1] ? `https://www.youtube.com/embed/${parts[1]}` : null
      }
    }
  } catch {
    return null
  }

  return null
}

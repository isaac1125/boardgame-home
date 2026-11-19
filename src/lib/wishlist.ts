/** Marker in sheet `notes` → row is wishlist-only (hidden from main catalog). */
export const WISHLIST_MARKER = '願望'

export const WISHLIST_STORAGE_KEY = 'bgh-wishlist-unlocked'
export const WISHLIST_HASH = '#wishlist'

/** Taps on brand title within this window unlock the easter egg. */
export const WISHLIST_TAP_TARGET = 7
export const WISHLIST_TAP_WINDOW_MS = 2000

/**
 * Microlink free OG image embed (CORS-friendly `<img src>`).
 * Prefer sheet `thumbnail_url` when sites block bots (e.g. BGG).
 * @see https://microlink.io/docs/api/parameters/embed
 */
export function microlinkOgImageUrl(pageUrl: string): string {
  const u = pageUrl.trim()
  if (!u) return ''
  return `https://api.microlink.io/?url=${encodeURIComponent(u)}&embed=image.url`
}

/** Secondary page preview (screenshot) when Microlink OG is missing/blocked. */
export function thumIoPreviewUrl(pageUrl: string): string {
  const u = pageUrl.trim()
  if (!u) return ''
  return `https://image.thum.io/get/width/480/noanimate/${u}`
}

/**
 * Candidate cover URLs for a wishlist card, in preference order:
 * 1) explicit `thumbnail_url`  2) Microlink OG  3) thum.io preview
 */
export function wishlistThumbCandidates(game: {
  thumbnailUrl: string
  refUrl: string
}): string[] {
  const out: string[] = []
  const thumb = game.thumbnailUrl.trim()
  if (thumb) out.push(thumb)
  const ref = game.refUrl.trim()
  if (ref) {
    const og = microlinkOgImageUrl(ref)
    const shot = thumIoPreviewUrl(ref)
    if (og) out.push(og)
    if (shot) out.push(shot)
  }
  return out
}

export function isWishlist(game: { notes: string }): boolean {
  return game.notes.includes(WISHLIST_MARKER)
}

/** Notes for display: strip the 願望 marker, tidy leftover separators. */
export function displayWishlistNotes(notes: string): string {
  return notes
    .replaceAll(WISHLIST_MARKER, '')
    .replace(/^[·|｜\s,，、／/.\-–—]+|[·|｜\s,，、／/.\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function readWishlistUnlocked(): boolean {
  try {
    return sessionStorage.getItem(WISHLIST_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeWishlistUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) sessionStorage.setItem(WISHLIST_STORAGE_KEY, '1')
    else sessionStorage.removeItem(WISHLIST_STORAGE_KEY)
  } catch {
    // private mode / blocked storage — easter egg still works in-memory
  }
}

export function isWishlistHash(hash = window.location.hash): boolean {
  return hash === WISHLIST_HASH || hash === '#wishlist/'
}

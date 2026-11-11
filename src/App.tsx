import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CatalogData, Game } from './types'
import { formatPlayTime, formatPlayers } from './lib/format'
import { loadCatalog, resolveAssetUrl } from './lib/loadCatalog'
import { youtubeEmbedUrl } from './lib/youtube'
import './App.css'

type PresetId = 'party-multi' | 'quick'

type Filters = {
  name: string
  /**
   * Inclusive player-count window. A game matches when its own
   * players_min..players_max fits inside this window
   * (game.playersMin >= rangeMin && game.playersMax <= rangeMax).
   * Default = full catalog bounds → no narrowing.
   */
  playersRangeMin: number
  playersRangeMax: number
  categories: Set<string>
  difficulties: Set<string>
  /** games with players_max >= this (scenario: 小組多人) */
  playersMaxAtLeast: number | null
  /** effective play time (max, else min) <= this; missing times excluded */
  playTimeCap: number | null
  /** default off = 教會 only; on = also include non-教會 locations */
  includeNonChurch: boolean
  /** default off = hide lent; on = also show lent games */
  includeLent: boolean
}

type CatalogBounds = { min: number; max: number }

const DEFAULT_BOUNDS: CatalogBounds = { min: 1, max: 15 }

function emptyFilters(bounds: CatalogBounds = DEFAULT_BOUNDS): Filters {
  return {
    name: '',
    playersRangeMin: bounds.min,
    playersRangeMax: bounds.max,
    categories: new Set(),
    difficulties: new Set(),
    playersMaxAtLeast: null,
    playTimeCap: null,
    includeNonChurch: false,
    includeLent: false,
  }
}

const PRESETS: Record<
  PresetId,
  { label: string; apply: (bounds: CatalogBounds) => Filters }
> = {
  'party-multi': {
    label: '小組多人派對',
    apply: (bounds) => ({
      ...emptyFilters(bounds),
      categories: new Set(['派對']),
      playersMaxAtLeast: 6,
    }),
  },
  quick: {
    label: '快速來一局',
    apply: (bounds) => ({
      ...emptyFilters(bounds),
      playTimeCap: 30,
    }),
  },
}

type QuizPatch = {
  categories?: string[]
  difficulties?: string[]
  playTimeCap?: number | null
  playersRange?: [number, number]
  playersMaxAtLeast?: number | null
}

type QuizOption = { label: string; patch: QuizPatch }
type QuizStep = { q: string; options: QuizOption[] }

const QUIZ_STEPS: QuizStep[] = [
  {
    q: '這一局的氣氛比較像…',
    options: [
      {
        label: '笑聲要蓋過隔壁桌',
        patch: { categories: ['派對', '反應', '詞語聯想'] },
      },
      {
        label: '大家圍著慢慢盤',
        patch: { categories: ['策略'] },
      },
      {
        label: '溫溫的家庭時光',
        patch: { categories: ['家庭', '合作'] },
      },
      {
        label: '誰是臥底？開始懷疑',
        patch: { categories: ['陣營', '解謎'] },
      },
    ],
  },
  {
    q: '你願意把晚上交給這一局多久？',
    options: [
      { label: '熱個身就好，十分鐘內收', patch: { playTimeCap: 20 } },
      { label: '一杯飲料的時間剛好', patch: { playTimeCap: 45 } },
      { label: '就沉浸這一款，不趕時間', patch: { playTimeCap: null } },
    ],
  },
  {
    q: '腦細胞目前電力？',
    options: [
      { label: '只想笑、拒絕算數', patch: { difficulties: ['無腦', '輕鬆'] } },
      { label: '可以稍微動一動', patch: { difficulties: ['輕鬆', '動腦'] } },
      { label: '來，燒一波', patch: { difficulties: ['動腦', '燒腦'] } },
    ],
  },
  {
    q: '桌上大概會坐幾個人？',
    options: [
      { label: '兩三人密談就好', patch: { playersRange: [1, 4] } },
      { label: '小組剛好一桌', patch: { playersRange: [2, 6] } },
      {
        label: '越多人越熱鬧',
        patch: { playersRange: [5, 99], playersMaxAtLeast: 5 },
      },
    ],
  },
]

function toggleSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/** Prefer max; if only min filled use that; both missing → null (exclude under cap). */
function effectivePlayTime(game: Game): number | null {
  if (game.playTimeMax != null) return game.playTimeMax
  if (game.playTimeMin != null) return game.playTimeMin
  return null
}

function isFullPlayersRange(filters: Filters, bounds: CatalogBounds): boolean {
  return filters.playersRangeMin <= bounds.min && filters.playersRangeMax >= bounds.max
}

function playersRangeActive(filters: Filters, bounds: CatalogBounds): boolean {
  return !isFullPlayersRange(filters, bounds)
}

function matchesFilters(game: Game, filters: Filters, bounds: CatalogBounds): boolean {
  const q = filters.name.trim().toLowerCase()
  if (q && !game.name.toLowerCase().includes(q)) return false

  if (playersRangeActive(filters, bounds)) {
    // Game's printed player range must fit inside the selected window.
    // (Not mere overlap — that barely narrowed the list when max was dragged down.)
    if (
      game.playersMin < filters.playersRangeMin ||
      game.playersMax > filters.playersRangeMax
    ) {
      return false
    }
  }

  if (filters.playersMaxAtLeast != null && game.playersMax < filters.playersMaxAtLeast) {
    return false
  }

  if (filters.playTimeCap != null) {
    const t = effectivePlayTime(game)
    if (t == null || t > filters.playTimeCap) return false
  }

  if (!filters.includeNonChurch && game.location !== '教會') return false
  if (!filters.includeLent && game.lentTo) return false

  if (filters.categories.size > 0 && !filters.categories.has(game.category)) return false
  if (filters.difficulties.size > 0 && !filters.difficulties.has(game.difficulty)) return false

  return true
}

function filterSummary(filters: Filters, bounds: CatalogBounds): string {
  const bits: string[] = []
  if (playersRangeActive(filters, bounds)) {
    bits.push(`${filters.playersRangeMin}–${filters.playersRangeMax} 人`)
  }
  if (filters.playersMaxAtLeast != null) bits.push(`最多≥${filters.playersMaxAtLeast}`)
  if (filters.playTimeCap != null) bits.push(`≤${filters.playTimeCap} 分`)
  if (filters.categories.size) bits.push([...filters.categories].join('、'))
  if (filters.difficulties.size) bits.push([...filters.difficulties].join('、'))
  if (filters.includeNonChurch) bits.push('含非教會')
  if (filters.includeLent) bits.push('含已借出')
  return bits.length ? bits.join(' · ') : '類別／難度／顯示'
}

function activeFilterCount(filters: Filters, bounds: CatalogBounds): number {
  return (
    filters.categories.size +
    filters.difficulties.size +
    (filters.includeNonChurch ? 1 : 0) +
    (filters.includeLent ? 1 : 0) +
    (filters.playersMaxAtLeast != null ? 1 : 0) +
    (filters.playTimeCap != null ? 1 : 0) +
    (playersRangeActive(filters, bounds) ? 1 : 0)
  )
}

function compareWithinGroup(a: Game, b: Game): number {
  const aChurch = a.location === '教會' ? 0 : 1
  const bChurch = b.location === '教會' ? 0 : 1
  if (aChurch !== bChurch) return aChurch - bChurch
  return a.name.localeCompare(b.name, 'zh-Hant')
}

function compareHighlightFirst(a: Game, b: Game): number {
  const aH = a.highlight ? 0 : 1
  const bH = b.highlight ? 0 : 1
  if (aH !== bH) return aH - bH
  return compareWithinGroup(a, b)
}

type PlayerGroup = { playersMax: number; games: Game[] }

function groupByPlayersMax(games: Game[]): PlayerGroup[] {
  const sorted = [...games].sort((a, b) => {
    if (b.playersMax !== a.playersMax) return b.playersMax - a.playersMax
    return compareWithinGroup(a, b)
  })

  const groups: PlayerGroup[] = []
  for (const game of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.playersMax === game.playersMax) {
      last.games.push(game)
    } else {
      groups.push({ playersMax: game.playersMax, games: [game] })
    }
  }
  return groups
}

function catalogBoundsFromGames(games: Game[]): CatalogBounds {
  if (games.length === 0) return DEFAULT_BOUNDS
  let min = Infinity
  let max = -Infinity
  for (const g of games) {
    min = Math.min(min, g.playersMin)
    max = Math.max(max, g.playersMax)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return DEFAULT_BOUNDS
  return { min, max }
}

function mergeQuizPatches(
  patches: QuizPatch[],
  bounds: CatalogBounds,
  preserve: Pick<Filters, 'includeNonChurch' | 'includeLent'>,
): Filters {
  const next = emptyFilters(bounds)
  next.includeNonChurch = preserve.includeNonChurch
  next.includeLent = preserve.includeLent

  const cats = new Set<string>()
  const diffs = new Set<string>()
  let playTimeCap: number | null | undefined
  let playersRange: [number, number] | undefined
  let playersMaxAtLeast: number | null | undefined

  for (const p of patches) {
    p.categories?.forEach((c) => cats.add(c))
    p.difficulties?.forEach((d) => diffs.add(d))
    if ('playTimeCap' in p) playTimeCap = p.playTimeCap ?? null
    if (p.playersRange) playersRange = p.playersRange
    if ('playersMaxAtLeast' in p) playersMaxAtLeast = p.playersMaxAtLeast ?? null
  }

  next.categories = cats
  next.difficulties = diffs
  if (playTimeCap !== undefined) next.playTimeCap = playTimeCap
  if (playersMaxAtLeast !== undefined) next.playersMaxAtLeast = playersMaxAtLeast
  if (playersRange) {
    next.playersRangeMin = Math.max(bounds.min, playersRange[0])
    next.playersRangeMax = Math.min(bounds.max, playersRange[1])
    if (next.playersRangeMin > next.playersRangeMax) {
      next.playersRangeMin = bounds.min
      next.playersRangeMax = bounds.max
    }
  }
  return next
}

function CoverThumb({
  url,
  name,
  size = 'card',
}: {
  url: string
  name: string
  size?: 'card' | 'detail'
}) {
  const [broken, setBroken] = useState(false)
  const src = resolveAssetUrl(url)
  const showImg = Boolean(src) && !broken

  return (
    <div className={`cover cover--${size}`} aria-hidden={showImg ? undefined : true}>
      {showImg ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <div className="cover__placeholder">
          <span>{name.slice(0, 1) || '?'}</span>
        </div>
      )}
    </div>
  )
}

function IconPeople() {
  return (
    <svg className="meta-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.5 6c0-2.4 2.2-4 5.5-4s5.5 1.6 5.5 4v1H2.5v-1Z"
      />
    </svg>
  )
}

function IconClock() {
  return (
    <svg className="meta-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 3a.75.75 0 0 1 .75.75V8H11a.75.75 0 0 1 0 1.5H8A.75.75 0 0 1 7.25 8V3.75A.75.75 0 0 1 8 3Z"
      />
    </svg>
  )
}

function IconPin() {
  return (
    <svg className="meta-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 1.5A4.5 4.5 0 0 0 3.5 6c0 2.7 3.2 6.4 4.1 7.4a.6.6 0 0 0 .9 0c.9-1 4.1-4.7 4.1-7.4A4.5 4.5 0 0 0 8 1.5Zm0 6.2A1.7 1.7 0 1 1 8 4.3a1.7 1.7 0 0 1 0 3.4Z"
      />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg className="search-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8.5 2a6.5 6.5 0 1 0 4.03 11.6l3.43 3.44a1 1 0 0 0 1.42-1.42l-3.44-3.43A6.5 6.5 0 0 0 8.5 2Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"
      />
    </svg>
  )
}

function formatPlayersRange(game: Game): string {
  if (game.playersMin === game.playersMax) return `${game.playersMax}`
  return `${game.playersMin}–${game.playersMax}`
}

/** 1–4 for known difficulties; 0 = unknown. */
function difficultyLevel(difficulty: string): 0 | 1 | 2 | 3 | 4 {
  switch (difficulty) {
    case '無腦':
      return 1
    case '輕鬆':
      return 2
    case '動腦':
      return 3
    case '燒腦':
      return 4
    default:
      return 0
  }
}

function DiffMeter({ level }: { level: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <span className="diff-meter" aria-hidden="true">
      {([1, 2, 3, 4] as const).map((n) => (
        <i key={n} className={level >= n ? 'is-on' : undefined} />
      ))}
    </span>
  )
}

function LentSeal({ who }: { who: string }) {
  return (
    <span className="lent-seal" aria-hidden="true">
      <span className="lent-seal__face">
        <span className="lent-seal__text">已借出</span>
        {who ? <small className="lent-seal__who">{who}</small> : null}
      </span>
    </span>
  )
}

function StickyGroupHeader({
  label,
  count,
  tone = 'yellow',
}: {
  label: string
  count: number
  tone?: 'yellow' | 'coral'
}) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: [0], rootMargin: '0px 0px 0px 0px' },
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [])

  return (
    <>
      <div ref={sentinelRef} className="sticky-sentinel" aria-hidden="true" />
      <h3
        className={`player-group__header player-group__header--${tone} ${stuck ? 'is-stuck' : ''}`}
      >
        <span className="player-group__title">{label}</span>
        <span className="player-group__count">{count} 款</span>
      </h3>
    </>
  )
}

function PlayersDualSlider({
  bounds,
  valueMin,
  valueMax,
  onChange,
}: {
  bounds: CatalogBounds
  valueMin: number
  valueMax: number
  onChange: (min: number, max: number) => void
}) {
  const [activeThumb, setActiveThumb] = useState<'min' | 'max' | null>(null)
  const span = Math.max(1, bounds.max - bounds.min)
  const leftPct = ((valueMin - bounds.min) / span) * 100
  const rightPct = ((valueMax - bounds.min) / span) * 100
  // Keep the last-dragged thumb on top so thumbs stay reachable when close.
  const minOnTop = activeThumb === 'min' || (activeThumb == null && leftPct > 50)

  function setMin(raw: number) {
    const next = Math.min(Math.max(raw, bounds.min), valueMax)
    onChange(next, valueMax)
  }

  function setMax(raw: number) {
    const next = Math.max(Math.min(raw, bounds.max), valueMin)
    onChange(valueMin, next)
  }

  return (
    <div className="range-field">
      <div className="range-field__label-row">
        <span className="range-field__label">人數</span>
        <span className="range-field__value">
          {valueMin === valueMax ? `${valueMin} 人` : `${valueMin}–${valueMax} 人`}
        </span>
      </div>
      <div
        className="dual-range"
        style={
          {
            '--range-left': `${leftPct}%`,
            '--range-right': `${rightPct}%`,
          } as CSSProperties
        }
      >
        <div className="dual-range__track" aria-hidden="true" />
        <div className="dual-range__fill" aria-hidden="true" />
        <input
          type="range"
          className={`dual-range__input dual-range__input--min ${minOnTop ? 'is-top' : ''}`}
          min={bounds.min}
          max={bounds.max}
          step={1}
          value={valueMin}
          aria-label="最少人數"
          onPointerDown={() => setActiveThumb('min')}
          onChange={(e) => setMin(Number(e.target.value))}
        />
        <input
          type="range"
          className={`dual-range__input dual-range__input--max ${minOnTop ? '' : 'is-top'}`}
          min={bounds.min}
          max={bounds.max}
          step={1}
          value={valueMax}
          aria-label="最多人數"
          onPointerDown={() => setActiveThumb('max')}
          onChange={(e) => setMax(Number(e.target.value))}
        />
      </div>
      <div className="dual-range__ends" aria-hidden="true">
        <span>{bounds.min}</span>
        <span>{bounds.max}</span>
      </div>
    </div>
  )
}

function GameCard({
  game,
  showLocation,
  showLentTo,
  enterIndex = 0,
  onOpen,
}: {
  game: Game
  showLocation: boolean
  showLentTo: boolean
  enterIndex?: number
  onOpen: () => void
}) {
  const time = formatPlayTime(game)
  const isLent = Boolean(game.lentTo)
  const statusBits = [game.unopened ? '未開封' : null].filter(Boolean)

  return (
    <button
      type="button"
      className={`game-card ${isLent ? 'game-card--lent' : ''}`}
      style={{ '--enter-i': Math.min(enterIndex, 14) } as CSSProperties}
      onClick={onOpen}
      aria-label={isLent ? `${game.name}（已借出）` : undefined}
    >
      <div className="game-card__body">
        <CoverThumb url={game.thumbnailUrl} name={game.name} size="card" />
        <div className="game-card__content">
          <div className="game-card__top">
            <h3>{game.name}</h3>
            {game.difficulty ? (
              <span className="tag-diff tag-diff--corner" title={`難度：${game.difficulty}`}>
                <DiffMeter level={difficultyLevel(game.difficulty)} />
                <span className="tag-diff__label">{game.difficulty}</span>
              </span>
            ) : (
              <span className="chev">→</span>
            )}
          </div>

          {game.category || game.highlight ? (
            <div className="tag-row">
              {game.highlight ? <span className="tag-highlight">{game.highlight}</span> : null}
              {game.category ? <span className="tag-cat">{game.category}</span> : null}
            </div>
          ) : null}

          <div className="meta-row">
            <div className="meta-row__main">
              <span className="meta-item" title="人數">
                <IconPeople />
                <span>{formatPlayersRange(game)}</span>
              </span>
              {time ? (
                <span className="meta-item" title="預計時間">
                  <IconClock />
                  <span>{time}</span>
                </span>
              ) : null}
            </div>
            {showLocation && game.location ? (
              <span
                className={`meta-item meta-item--loc ${isLent ? 'meta-item--loc-under-seal' : ''}`}
                title="放置位置"
              >
                <IconPin />
                <span>{game.location}</span>
              </span>
            ) : null}
          </div>

          {statusBits.length > 0 ? (
            <div className="status-line">{statusBits.join(' · ')}</div>
          ) : null}
        </div>
      </div>
      {isLent ? <LentSeal who={showLentTo ? game.lentTo : ''} /> : null}
    </button>
  )
}

function DetailPanel({
  game,
  settings,
  onClose,
}: {
  game: Game
  settings: CatalogData['settings']
  onClose: () => void
}) {
  const time = formatPlayTime(game)
  const embed = youtubeEmbedUrl(game.rulesVideoUrl)

  return (
    <div className="detail-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${game.name} 詳情`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-panel__header">
          <div className="detail-panel__title-row">
            <CoverThumb url={game.thumbnailUrl} name={game.name} size="detail" />
            <div className="detail-panel__title-text">
              <h2>{game.name}</h2>
              <div className="tag-row">
                {game.highlight ? <span className="tag-highlight">{game.highlight}</span> : null}
                {game.category ? <span className="tag-cat">{game.category}</span> : null}
              </div>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>

        <div className="detail-grid">
          <div>
            <div className="label">人數</div>
            <div className="value">{formatPlayers(game)}</div>
          </div>
          <div>
            <div className="label">預計時間</div>
            <div className="value">{time ?? '—'}</div>
          </div>
          <div>
            <div className="label">類別</div>
            <div className="value">{game.category || '—'}</div>
          </div>
          <div>
            <div className="label">難易度</div>
            <div className="value">{game.difficulty || '—'}</div>
          </div>
          {settings.showLocation ? (
            <div>
              <div className="label">放置位置</div>
              <div className="value">{game.location || '—'}</div>
            </div>
          ) : null}
          <div>
            <div className="label">狀態</div>
            <div className="value">
              {game.unopened ? '未開封' : game.lentTo ? '已借出' : '可拿'}
            </div>
          </div>
          {game.highlight ? (
            <div>
              <div className="label">精選</div>
              <div className="value">{game.highlight}</div>
            </div>
          ) : null}
          {settings.showLentTo && game.lentTo ? (
            <div className="span-2">
              <div className="label">借出給</div>
              <div className="value">{game.lentTo}</div>
            </div>
          ) : null}
        </div>

        {game.notes ? (
          <div className="notes-box">
            <div className="label">備註</div>
            <p>{game.notes}</p>
          </div>
        ) : null}

        {embed ? (
          <div className="video-box">
            <div className="label">規則影片</div>
            <div className="video-frame">
              <iframe
                src={embed}
                title={`${game.name} 規則影片`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  )
}

function QuizPanel({
  open,
  step,
  onClose,
  onPick,
}: {
  open: boolean
  step: number
  onClose: () => void
  onPick: (option: QuizOption) => void
}) {
  if (!open) return null
  const current = QUIZ_STEPS[step]
  if (!current) return null

  return (
    <div className="quiz-backdrop" role="presentation" onClick={onClose}>
      <div
        className="quiz-panel"
        role="dialog"
        aria-modal="true"
        aria-label="玩什麼？測一測"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quiz-panel__header">
          <div>
            <p className="quiz-panel__kicker">玩什麼？測一測</p>
            <h2>
              {step + 1}/{QUIZ_STEPS.length} · {current.q}
            </h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉測驗">
            ×
          </button>
        </div>
        <div className="quiz-options">
          {current.options.map((opt) => (
            <button
              key={opt.label}
              type="button"
              className="quiz-option"
              onClick={() => onPick(opt)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<CatalogData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bounds, setBounds] = useState<CatalogBounds>(DEFAULT_BOUNDS)
  const [filters, setFilters] = useState<Filters>(() => emptyFilters())
  const [activePreset, setActivePreset] = useState<PresetId | null>(null)
  const [selected, setSelected] = useState<Game | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)
  const [quizStep, setQuizStep] = useState(0)
  const [quizPatches, setQuizPatches] = useState<QuizPatch[]>([])
  const [quizToast, setQuizToast] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let cancelled = false
    loadCatalog()
      .then((catalog) => {
        if (cancelled) return
        const b = catalogBoundsFromGames(catalog.games)
        setBounds(b)
        setFilters(emptyFilters(b))
        setData(catalog)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '載入失敗')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  useEffect(() => {
    if (!searchOpen) return
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [searchOpen])

  useEffect(() => {
    if (!quizToast) return
    const t = window.setTimeout(() => setQuizToast(null), 2600)
    return () => window.clearTimeout(t)
  }, [quizToast])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.games.filter((g) => matchesFilters(g, filters, bounds))
  }, [data, filters, bounds])

  const highlighted = useMemo(
    () => [...filtered.filter((g) => g.highlight)].sort(compareHighlightFirst),
    [filtered],
  )

  const restGames = useMemo(() => {
    if (highlighted.length === 0) return filtered
    const names = new Set(highlighted.map((g) => g.name))
    return filtered.filter((g) => !names.has(g.name))
  }, [filtered, highlighted])

  const groups = useMemo(() => groupByPlayersMax(restGames), [restGames])

  /** Remount list on filter/preset change → fade + restagger cards. */
  const listKey = useMemo(
    () =>
      [
        filters.name,
        filters.playersRangeMin,
        filters.playersRangeMax,
        [...filters.categories].join(','),
        [...filters.difficulties].join(','),
        String(filters.includeNonChurch),
        String(filters.includeLent),
        String(filters.playersMaxAtLeast),
        String(filters.playTimeCap),
        activePreset ?? '',
      ].join('|'),
    [filters, activePreset],
  )

  const chipCount = activeFilterCount(filters, bounds)
  const hasSearch = filters.name.trim().length > 0

  function applyPreset(id: PresetId) {
    if (activePreset === id) {
      setFilters((f) => ({
        ...emptyFilters(bounds),
        includeNonChurch: f.includeNonChurch,
        includeLent: f.includeLent,
      }))
      setActivePreset(null)
      return
    }
    setFilters((f) => ({
      ...PRESETS[id].apply(bounds),
      includeNonChurch: f.includeNonChurch,
      includeLent: f.includeLent,
    }))
    setActivePreset(id)
  }

  function clearAllFilters() {
    setFilters(emptyFilters(bounds))
    setActivePreset(null)
  }

  function openQuiz() {
    setQuizPatches([])
    setQuizStep(0)
    setQuizOpen(true)
  }

  function closeQuiz() {
    setQuizOpen(false)
    setQuizStep(0)
    setQuizPatches([])
  }

  function pickQuizOption(option: QuizOption) {
    const nextPatches = [...quizPatches, option.patch]
    if (quizStep + 1 < QUIZ_STEPS.length) {
      setQuizPatches(nextPatches)
      setQuizStep((s) => s + 1)
      return
    }

    setFilters((f) =>
      mergeQuizPatches(nextPatches, bounds, {
        includeNonChurch: f.includeNonChurch,
        includeLent: f.includeLent,
      }),
    )
    setActivePreset(null)
    setQuizOpen(false)
    setQuizStep(0)
    setQuizPatches([])
    setQuizToast('已依你的選擇調好篩選')
    window.setTimeout(() => {
      listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  if (error) {
    return (
      <div className="page">
        <header className="topbar">
          <div className="brand">桌遊抵家</div>
          <div className="topbar-right">Boardgame Home</div>
        </header>
        <div className="panel error-panel">
          <h1>載入失敗</h1>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="page">
        <header className="topbar">
          <div className="brand">桌遊抵家</div>
          <div className="topbar-right">Boardgame Home</div>
        </header>
        <div className="panel">
          <p className="loading">載入中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">桌遊抵家</div>
        <div className="topbar-tools">
          <div className={`search-collapse ${searchOpen ? 'is-open' : ''} ${hasSearch ? 'has-query' : ''}`}>
            {searchOpen ? (
              <label className="search-collapse__field">
                <span className="visually-hidden">搜尋名稱</span>
                <input
                  ref={searchInputRef}
                  type="search"
                  placeholder="搜尋遊戲…"
                  value={filters.name}
                  onChange={(e) => {
                    setActivePreset(null)
                    setFilters((f) => ({ ...f, name: e.target.value }))
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      if (!filters.name) setSearchOpen(false)
                    }
                  }}
                />
                <button
                  type="button"
                  className="search-collapse__close"
                  aria-label="收合搜尋"
                  onClick={() => setSearchOpen(false)}
                >
                  ×
                </button>
              </label>
            ) : (
              <button
                type="button"
                className="search-collapse__btn"
                aria-label={hasSearch ? `搜尋（已輸入 ${filters.name}）` : '開啟搜尋'}
                aria-expanded={false}
                onClick={() => setSearchOpen(true)}
              >
                <IconSearch />
                {hasSearch ? <span className="search-collapse__dot" aria-hidden /> : null}
              </button>
            )}
          </div>
          <div className="topbar-right">Boardgame Home</div>
        </div>
      </header>

      {data.source === 'sample' ? (
        <div className="sample-banner" role="status">
          目前顯示<strong>樣本資料</strong>。接上 Google 試算表後會自動改讀正式清單。
        </div>
      ) : null}

      <section className="panel filter-panel">
        <PlayersDualSlider
          bounds={bounds}
          valueMin={filters.playersRangeMin}
          valueMax={filters.playersRangeMax}
          onChange={(min, max) => {
            setActivePreset(null)
            setFilters((f) => ({ ...f, playersRangeMin: min, playersRangeMax: max }))
          }}
        />

        <div className="presets" role="group" aria-label="情境快捷">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`preset-chip ${activePreset === id ? 'is-on' : ''}`}
              aria-pressed={activePreset === id}
              onClick={() => applyPreset(id)}
            >
              {PRESETS[id].label}
            </button>
          ))}
          {activePreset ||
          chipCount > 0 ||
          hasSearch ||
          playersRangeActive(filters, bounds) ? (
            <button type="button" className="preset-chip preset-chip--clear" onClick={clearAllFilters}>
              清除
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className={`filter-summary ${filtersOpen ? 'is-open' : ''} ${chipCount ? 'has-active' : ''}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <span className="filter-summary__label">
            篩選
            {chipCount > 0 ? <em>{chipCount}</em> : null}
          </span>
          <span className="filter-summary__text">{filterSummary(filters, bounds)}</span>
          <span className="filter-summary__chev" aria-hidden>
            {filtersOpen ? '▴' : '▾'}
          </span>
        </button>

        {filtersOpen ? (
          <div className="filter-extra">
            <div className="chip-block">
              <div className="chip-label">類別</div>
              <div className="chips chips--scroll">
                {data.categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip ${filters.categories.has(c) ? 'is-on chip--yellow' : ''}`}
                    aria-pressed={filters.categories.has(c)}
                    onClick={() => {
                      setActivePreset(null)
                      setFilters((f) => ({ ...f, categories: toggleSet(f.categories, c) }))
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="chip-block">
              <div className="chip-label">難易度</div>
              <div className="chips chips--scroll">
                {data.difficulties.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`chip ${filters.difficulties.has(d) ? 'is-on chip--diff' : ''}`}
                    aria-pressed={filters.difficulties.has(d)}
                    onClick={() => {
                      setActivePreset(null)
                      setFilters((f) => ({ ...f, difficulties: toggleSet(f.difficulties, d) }))
                    }}
                  >
                    <DiffMeter level={difficultyLevel(d)} />
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="toggle-stack">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={filters.includeNonChurch}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, includeNonChurch: e.target.checked }))
                  }
                />
                <span>顯示不在教會的</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={filters.includeLent}
                  onChange={(e) => setFilters((f) => ({ ...f, includeLent: e.target.checked }))}
                />
                <span>顯示已借出的</span>
              </label>
            </div>
          </div>
        ) : null}
      </section>

      <section className="list-section" ref={listRef} id="game-list">
        <div className="list-header">
          <h2>遊戲列表</h2>
          <span>共 {filtered.length} 款</span>
        </div>

        {filtered.length === 0 ? (
          <div key={listKey} className="panel empty list-swap">
            沒有符合條件的遊戲，試試放寬篩選。
          </div>
        ) : (
          <div key={listKey} className="grouped-list list-swap">
            {(() => {
              let enterIndex = 0
              return (
                <>
                  {highlighted.length > 0 ? (
                    <div className="player-group player-group--highlight">
                      <StickyGroupHeader
                        label="精選"
                        count={highlighted.length}
                        tone="coral"
                      />
                      <div className="game-grid">
                        {highlighted.map((game) => {
                          const i = enterIndex++
                          return (
                            <GameCard
                              key={`hi-${game.name}`}
                              game={game}
                              showLocation={data.settings.showLocation}
                              showLentTo={data.settings.showLentTo}
                              enterIndex={i}
                              onOpen={() => setSelected(game)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {groups.map((group) => (
                    <div key={group.playersMax} className="player-group">
                      <StickyGroupHeader
                        label={`${group.playersMax}人`}
                        count={group.games.length}
                      />
                      <div className="game-grid">
                        {group.games.map((game) => {
                          const i = enterIndex++
                          return (
                            <GameCard
                              key={game.name}
                              game={game}
                              showLocation={data.settings.showLocation}
                              showLentTo={data.settings.showLentTo}
                              enterIndex={i}
                              onOpen={() => setSelected(game)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )
            })()}
          </div>
        )}
      </section>

      <button
        type="button"
        className="quiz-fab"
        onClick={openQuiz}
        aria-label="玩什麼？測一測"
      >
        <span className="quiz-fab__main">玩什麼？</span>
        <span className="quiz-fab__sub">測一測</span>
      </button>

      {quizToast ? (
        <div className="quiz-toast" role="status">
          {quizToast}
        </div>
      ) : null}

      <QuizPanel
        open={quizOpen}
        step={quizStep}
        onClose={closeQuiz}
        onPick={pickQuizOption}
      />

      {selected ? (
        <DetailPanel
          game={selected}
          settings={data.settings}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  )
}

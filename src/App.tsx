import { useEffect, useMemo, useState } from 'react'
import type { CatalogData, Game } from './types'
import { formatPlayTime, formatPlayers } from './lib/format'
import { loadCatalog, resolveAssetUrl } from './lib/loadCatalog'
import { youtubeEmbedUrl } from './lib/youtube'
import './App.css'

type PresetId = 'party-multi' | 'quick'

type Filters = {
  name: string
  players: string
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

const emptyFilters = (): Filters => ({
  name: '',
  players: '',
  categories: new Set(),
  difficulties: new Set(),
  playersMaxAtLeast: null,
  playTimeCap: null,
  includeNonChurch: false,
  includeLent: false,
})

const PRESETS: Record<
  PresetId,
  { label: string; apply: () => Filters }
> = {
  'party-multi': {
    label: '小組多人派對',
    apply: () => ({
      ...emptyFilters(),
      categories: new Set(['派對']),
      playersMaxAtLeast: 6,
    }),
  },
  quick: {
    label: '快速來一局',
    apply: () => ({
      ...emptyFilters(),
      playTimeCap: 30,
    }),
  },
}

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

function matchesFilters(game: Game, filters: Filters): boolean {
  const q = filters.name.trim().toLowerCase()
  if (q && !game.name.toLowerCase().includes(q)) return false

  if (filters.players.trim()) {
    const n = Number(filters.players)
    if (!Number.isFinite(n) || n < game.playersMin || n > game.playersMax) return false
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

function filterSummary(filters: Filters): string {
  const bits: string[] = []
  if (filters.players.trim()) bits.push(`${filters.players} 人`)
  if (filters.playersMaxAtLeast != null) bits.push(`最多≥${filters.playersMaxAtLeast}`)
  if (filters.playTimeCap != null) bits.push(`≤${filters.playTimeCap} 分`)
  if (filters.categories.size) bits.push([...filters.categories].join('、'))
  if (filters.difficulties.size) bits.push([...filters.difficulties].join('、'))
  if (filters.includeNonChurch) bits.push('含非教會')
  if (filters.includeLent) bits.push('含已借出')
  return bits.length ? bits.join(' · ') : '類別／難度／顯示'
}

function activeFilterCount(filters: Filters): number {
  return (
    filters.categories.size +
    filters.difficulties.size +
    (filters.includeNonChurch ? 1 : 0) +
    (filters.includeLent ? 1 : 0) +
    (filters.playersMaxAtLeast != null ? 1 : 0) +
    (filters.playTimeCap != null ? 1 : 0)
  )
}

function compareWithinGroup(a: Game, b: Game): number {
  const aChurch = a.location === '教會' ? 0 : 1
  const bChurch = b.location === '教會' ? 0 : 1
  if (aChurch !== bChurch) return aChurch - bChurch
  return a.name.localeCompare(b.name, 'zh-Hant')
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

function GameCard({
  game,
  showLocation,
  onOpen,
}: {
  game: Game
  showLocation: boolean
  onOpen: () => void
}) {
  const time = formatPlayTime(game)

  const statusBits = [
    game.unopened ? '未開封' : null,
    game.lentTo ? '已借出' : null,
  ].filter(Boolean)

  return (
    <button type="button" className="game-card" onClick={onOpen}>
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

          {game.category ? (
            <div className="tag-row">
              <span className="tag-cat">{game.category}</span>
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
              <span className="meta-item meta-item--loc" title="放置位置">
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
              {game.category ? <span className="tag-cat">{game.category}</span> : null}
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

export default function App() {
  const [data, setData] = useState<CatalogData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [activePreset, setActivePreset] = useState<PresetId | null>(null)
  const [selected, setSelected] = useState<Game | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadCatalog()
      .then((catalog) => {
        if (!cancelled) setData(catalog)
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

  const filtered = useMemo(() => {
    if (!data) return []
    return data.games.filter((g) => matchesFilters(g, filters))
  }, [data, filters])

  const groups = useMemo(() => groupByPlayersMax(filtered), [filtered])

  const chipCount = activeFilterCount(filters)

  function applyPreset(id: PresetId) {
    if (activePreset === id) {
      setFilters((f) => ({
        ...emptyFilters(),
        includeNonChurch: f.includeNonChurch,
        includeLent: f.includeLent,
      }))
      setActivePreset(null)
      return
    }
    setFilters((f) => ({
      ...PRESETS[id].apply(),
      includeNonChurch: f.includeNonChurch,
      includeLent: f.includeLent,
    }))
    setActivePreset(id)
  }

  function clearAllFilters() {
    setFilters(emptyFilters())
    setActivePreset(null)
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
        <div className="topbar-right">Boardgame Home</div>
      </header>

      {data.source === 'sample' ? (
        <div className="sample-banner" role="status">
          目前顯示<strong>樣本資料</strong>。接上 Google 試算表後會自動改讀正式清單。
        </div>
      ) : null}

      <section className="panel filter-panel">
        <div className="filter-grid">
          <label className="field field--players">
            <span>人數</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="4"
              value={filters.players}
              onChange={(e) => {
                setActivePreset(null)
                setFilters((f) => ({ ...f, players: e.target.value }))
              }}
            />
          </label>
          <label className="field field--grow">
            <span>名稱</span>
            <input
              type="search"
              placeholder="關鍵字…"
              value={filters.name}
              onChange={(e) => {
                setActivePreset(null)
                setFilters((f) => ({ ...f, name: e.target.value }))
              }}
            />
          </label>
        </div>

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
          {activePreset || chipCount > 0 || filters.players.trim() || filters.name.trim() ? (
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
          <span className="filter-summary__text">{filterSummary(filters)}</span>
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

      <section className="list-section">
        <div className="list-header">
          <h2>遊戲列表</h2>
          <span>共 {filtered.length} 款</span>
        </div>

        {filtered.length === 0 ? (
          <div className="panel empty">沒有符合條件的遊戲，試試放寬篩選。</div>
        ) : (
          <div className="grouped-list">
            {groups.map((group) => (
              <div key={group.playersMax} className="player-group">
                <h3 className="player-group__header">
                  <span className="player-group__title">{group.playersMax}人</span>
                  <span className="player-group__count">{group.games.length} 款</span>
                </h3>
                <div className="game-grid">
                  {group.games.map((game) => (
                    <GameCard
                      key={game.name}
                      game={game}
                      showLocation={data.settings.showLocation}
                      onOpen={() => setSelected(game)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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

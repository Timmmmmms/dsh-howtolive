import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { IconSearchOutlineRegular, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ChapterInfo,
  DimensionId,
  DimensionMeta,
  ItemStatus,
  RoiTier,
  SortMode,
  ViewMode,
} from '../../shared/types.ts'
import type { HowToLiveLocaleKey } from '../locales.ts'
import { IconClock, IconLayoutGrid, IconScanRadar, IconSliders, IconX } from './Icons.tsx'
import css from './FilterBar.module.css'

export interface FilterState {
  readonly query: string
  readonly dimension: DimensionId | 'all'
  readonly chapterNumber: number | 'all'
  readonly status: ItemStatus | 'all'
  readonly tier: RoiTier | 'all'
  readonly zeroCostOnly: boolean
  readonly gradeAOnly: boolean
  readonly dueReviewOnly: boolean
  readonly audience: string
  readonly sort: SortMode
}

export const DEFAULT_FILTERS: FilterState = {
  query: '',
  dimension: 'all',
  chapterNumber: 'all',
  status: 'all',
  tier: 'all',
  zeroCostOnly: false,
  gradeAOnly: false,
  dueReviewOnly: false,
  audience: '',
  sort: 'chapter',
}

export interface FilterBarProps {
  readonly filters: FilterState
  readonly dimensions: readonly DimensionMeta[]
  readonly chapters: readonly ChapterInfo[]
  readonly audiences: readonly { readonly name: string; readonly count: number }[]
  readonly shownCount: number
  readonly totalCount: number
  readonly skippedCount: number
  /** 是否启用 `/` 快捷键聚焦搜索框（弹窗打开时可禁用） */
  readonly shortcutEnabled?: boolean
  /** 当前主视图模式（cards / cve），传入 onViewModeChange 时在筛选栏右侧展示视图切换 Tab */
  readonly viewMode?: ViewMode
  readonly onViewModeChange?: (mode: ViewMode) => void
  /** 漏洞扫描未修复高危数角标 */
  readonly cveCriticalCount?: number
  /** 到期待复检补丁数 */
  readonly dueReviewCount?: number
  readonly onChange: (next: FilterState) => void
  readonly t: TranslateNS<'howtolive'>
}

const STATUS_OPTIONS: ReadonlyArray<{ value: ItemStatus | 'all'; labelKey: HowToLiveLocaleKey }> = [
  { value: 'all', labelKey: 'filter.status.all' },
  { value: 'todo', labelKey: 'filter.status.todo' },
  { value: 'planned', labelKey: 'filter.status.planned' },
  { value: 'done', labelKey: 'filter.status.done' },
  { value: 'skipped', labelKey: 'filter.status.skipped' },
]

const SORT_OPTIONS: ReadonlyArray<{ value: SortMode; labelKey: HowToLiveLocaleKey }> = [
  { value: 'chapter', labelKey: 'filter.sort.chapter' },
  { value: 'roi', labelKey: 'filter.sort.roi' },
  { value: 'zeroCost', labelKey: 'filter.sort.zeroCost' },
  { value: 'xp', labelKey: 'filter.sort.xp' },
  { value: 'noted', labelKey: 'filter.sort.noted' },
]

/**
 * 极简分层筛选栏：
 * - 顶层：六维分段导航标签条，直观切换人生防线
 * - 中层：流线型搜索框 + 状态分段切换 + 可折叠高级筛选抽屉，彻底消除密密麻麻的视觉噪音
 */
export function FilterBar({
  filters,
  dimensions,
  chapters,
  audiences,
  shownCount,
  totalCount,
  skippedCount,
  shortcutEnabled = true,
  viewMode = 'cards',
  onViewModeChange,
  cveCriticalCount = 0,
  dueReviewCount = 0,
  onChange,
  t,
}: FilterBarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const searchWrapRef = useRef<HTMLDivElement>(null)

  const focusSearchInput = () => {
    const input = searchWrapRef.current?.querySelector('input')
    input?.focus()
  }

  // 全局 `/` 快捷键聚焦搜索框（在输入态或弹窗态下自动让位）
  useEffect(() => {
    if (!shortcutEnabled) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target
        && (target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      focusSearchInput()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcutEnabled])

  const advancedCount =
    (filters.chapterNumber !== 'all' ? 1 : 0)
    + (filters.audience !== '' ? 1 : 0)
    + (filters.tier !== 'all' ? 1 : 0)
    + (filters.zeroCostOnly ? 1 : 0)
    + (filters.gradeAOnly ? 1 : 0)

  const hasActiveFilter =
    filters.query !== ''
    || filters.dimension !== 'all'
    || filters.status !== 'all'
    || filters.sort !== 'chapter'
    || filters.dueReviewOnly
    || advancedCount > 0

  const visibleChapters = filters.dimension === 'all'
    ? chapters
    : chapters.filter((c) => c.dimension === filters.dimension)

  return (
    <div className={css.wrap}>
      {/* 顶行：六维横向导航条 + 右侧主视图切换 Tab */}
      <div className={css.topBar}>
        <nav className={css.dimTabs} aria-label={t('filter.allDimensions')}>
          <button
            type="button"
            className={clsx(css.dimTab, filters.dimension === 'all' && css.dimTabActive)}
            aria-pressed={filters.dimension === 'all'}
            onClick={() => onChange({ ...filters, dimension: 'all', chapterNumber: 'all' })}
          >
            {t('filter.allDimensions')}
          </button>
          {dimensions.map((dim) => {
            const active = filters.dimension === dim.id
            return (
              <button
                key={dim.id}
                type="button"
                className={clsx(css.dimTab, active && css.dimTabActive)}
                aria-pressed={active}
                onClick={() => onChange({ ...filters, dimension: active ? 'all' : dim.id, chapterNumber: 'all' })}
              >
                {dim.name}
              </button>
            )
          })}
        </nav>

        {onViewModeChange && (
          <div className={css.viewSwitch} role="tablist" aria-label={t('view.switcherLabel')}>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'cards'}
              className={clsx(css.viewTab, viewMode === 'cards' && css.viewTabActive)}
              onClick={() => onViewModeChange('cards')}
            >
              <IconLayoutGrid size={13} />
              <span>{t('view.cards')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'cve'}
              className={clsx(css.viewTab, viewMode === 'cve' && css.viewTabActive)}
              onClick={() => onViewModeChange('cve')}
            >
              <IconScanRadar size={13} />
              <span>{t('view.cve')}</span>
              {cveCriticalCount > 0 && (
                <span className={css.cveBadge}>{cveCriticalCount}</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 搜索 + 状态分段 + 排序 + 高级筛选开关 */}
      <div className={css.toolRow}>
        <div ref={searchWrapRef} className={css.searchWrap}>
          <Input
            className={css.searchInput}
            icon={<IconSearchOutlineRegular size={15} />}
            value={filters.query}
            placeholder={t('filter.searchPlaceholder')}
            aria-label={t('filter.searchPlaceholder')}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
          />
          {filters.query.length > 0 && (
            <button
              type="button"
              className={css.clearBtn}
              aria-label={t('filter.clearSearch')}
              title={t('filter.clearSearch')}
              onClick={() => {
                onChange({ ...filters, query: '' })
                focusSearchInput()
              }}
            >
              <IconX size={13} />
            </button>
          )}
        </div>

        {viewMode === 'cards' && (
          <>
            <div className={css.segmented} role="group" aria-label={t('filter.status.all')}>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={clsx(css.segBtn, filters.status === opt.value && css.segBtnActive)}
                  aria-pressed={filters.status === opt.value}
                  onClick={() => onChange({ ...filters, status: opt.value })}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>

            <select
              className={css.sortSelect}
              aria-label={t('filter.sortLabel')}
              value={filters.sort}
              onChange={(e) => onChange({ ...filters, sort: e.target.value as SortMode })}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </>
        )}

        <button
          type="button"
          className={clsx(css.advToggle, (advancedOpen || advancedCount > 0) && css.advToggleActive)}
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <IconSliders size={14} />
          <span>{t('filter.advanced')}</span>
          {advancedCount > 0 && <span className={css.advBadge}>{advancedCount}</span>}
        </button>

        {viewMode === 'cards' && (dueReviewCount > 0 || filters.dueReviewOnly) && (
          <button
            type="button"
            className={clsx(css.dueToggle, filters.dueReviewOnly && css.dueToggleActive)}
            aria-pressed={filters.dueReviewOnly}
            onClick={() =>
              onChange({
                ...filters,
                dueReviewOnly: !filters.dueReviewOnly,
                status: !filters.dueReviewOnly ? 'done' : filters.status,
              })
            }
          >
            <IconClock size={13} />
            <span>{t('review.filterPill', { count: dueReviewCount })}</span>
          </button>
        )}
      </div>

      {/* 可折叠高级筛选面板 */}
      {advancedOpen && (
        <div className={css.advPanel}>
          <div className={css.selectGroup}>
            <select
              className={css.select}
              aria-label={t('filter.allChapters')}
              value={filters.chapterNumber === 'all' ? 'all' : String(filters.chapterNumber)}
              onChange={(e) => {
                const v = e.target.value
                onChange({ ...filters, chapterNumber: v === 'all' ? 'all' : Number(v) })
              }}
            >
              <option value="all">{t('filter.allChapters')}</option>
              {visibleChapters.map((ch) => (
                <option key={ch.number} value={String(ch.number)}>
                  {String(ch.number).padStart(2, '0')}. {ch.title} ({ch.itemCount})
                </option>
              ))}
            </select>

            <select
              className={css.select}
              aria-label={t('filter.allAudiences')}
              value={filters.audience}
              onChange={(e) => onChange({ ...filters, audience: e.target.value })}
            >
              <option value="">{t('filter.allAudiences')}</option>
              {audiences.map((aud) => (
                <option key={aud.name} value={aud.name}>
                  {aud.name} ({aud.count})
                </option>
              ))}
            </select>
          </div>

          <div className={css.pillRow}>
            <Pill
              active={filters.tier === 'S'}
              onClick={() => onChange({ ...filters, tier: filters.tier === 'S' ? 'all' : 'S' })}
            >
              {t('filter.tierS')}
            </Pill>
            <Pill
              active={filters.tier === 'A'}
              onClick={() => onChange({ ...filters, tier: filters.tier === 'A' ? 'all' : 'A' })}
            >
              {t('filter.tierA')}
            </Pill>
            <Pill
              active={filters.zeroCostOnly}
              onClick={() => onChange({ ...filters, zeroCostOnly: !filters.zeroCostOnly })}
            >
              {t('filter.zeroCost')}
            </Pill>
            <Pill
              active={filters.gradeAOnly}
              onClick={() => onChange({ ...filters, gradeAOnly: !filters.gradeAOnly })}
            >
              {t('filter.gradeA')}
            </Pill>
          </div>
        </div>
      )}

      <div className={css.metaBar}>
        <span>{t('filter.count', { shown: shownCount, total: totalCount })}</span>
        {skippedCount > 0 && (
          <span className={css.skippedNotice}>
            {t('filter.skippedHint', { count: skippedCount })}
          </span>
        )}
        {hasActiveFilter && (
          <button
            type="button"
            className={css.resetBtn}
            onClick={() => onChange(DEFAULT_FILTERS)}
          >
            {t('filter.reset')}
          </button>
        )}
      </div>
    </div>
  )
}

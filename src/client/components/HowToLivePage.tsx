import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { computeBadges } from '../../shared/badges.ts'
import { scanLifeVulnerabilities } from '../../shared/cve.ts'
import { findProfileSkipCandidates } from '../../shared/profile-filter.ts'
import { countDueReviewItems, isItemDueForReview } from '../../shared/scoring.ts'
import {
  buildChaosDrillPrompt,
  buildCheckupPrompt,
  buildItemActionPrompt,
  buildScenarioPrompt,
  buildWeekendPlanPrompt,
  selectChaosDrillCandidates,
} from '../../shared/scenarios.ts'
import type {
  ItemProgressPatch,
  ItemStatus,
  KnowledgeItem,
  KnowledgeItemSummary,
  ProgressUpdateResult,
  RoiTier,
  ScenarioPreset,
  UserProfile,
  ViewMode,
} from '../../shared/types.ts'
import type { HowToLiveViewSnapshot } from '../store.ts'
import { BadgesModal } from './BadgesModal.tsx'
import { CveScannerView } from './CveScannerView.tsx'
import { DailyPickCard } from './DailyPickCard.tsx'
import { DEFAULT_FILTERS, FilterBar, type FilterState } from './FilterBar.tsx'
import {
  IconArrowUp,
  IconDownload,
  IconRefresh,
  IconShareCard,
  IconShieldCheck,
  IconSparkles,
  IconUser,
} from './Icons.tsx'
import { ItemCard } from './ItemCard.tsx'
import { ItemDetailDrawer } from './ItemDetailDrawer.tsx'
import { LifeRadarCard } from './LifeRadarCard.tsx'
import { PatchGraphView } from './PatchGraphView.tsx'
import { PatchSprintModal } from './PatchSprintModal.tsx'
import { ProfileModal } from './ProfileModal.tsx'
import { ProfileSkipWizardModal } from './ProfileSkipWizardModal.tsx'
import { ScenarioBar } from './ScenarioBar.tsx'
import { ShareCardModal } from './ShareCardModal.tsx'
import css from './HowToLivePage.module.css'

const PAGE_SIZE = 30
const FOCUS_REFRESH_THROTTLE_MS = 15_000
const TIER_RANK: Record<RoiTier, number> = { S: 0, A: 1, B: 2, C: 3 }

interface ToastState {
  readonly id: number
  readonly message: string
  readonly tone: 'success' | 'info' | 'error'
  readonly action?: {
    readonly label: string
    readonly onClick: () => void
  }
}

export interface HowToLivePageInjected {
  readonly hooks: {
    readonly howtolive: HostObservable<HowToLiveViewSnapshot>
  }
  readonly ensureLoaded: () => Promise<void>
  readonly refresh: () => Promise<void>
  readonly refreshState?: () => Promise<void>
  readonly openItemDetail: (id: string, options?: { pushHistory?: boolean }) => Promise<void>
  readonly goBackItemDetail?: () => Promise<void>
  readonly closeItemDetail: () => void
  readonly setItemProgress: (id: string, patch: ItemProgressPatch) => Promise<ProgressUpdateResult | unknown>
  readonly setItemsProgressBatch?: (
    updates: ReadonlyArray<{ id: string } & ItemProgressPatch>,
  ) => Promise<{ updatedCount: number } | unknown>
  readonly saveProfile: (profile: UserProfile) => Promise<void>
  readonly rerollDaily: () => Promise<void>
  readonly exportMarkdown: () => Promise<{ filename: string; markdown: string }>
  readonly syncUpstream: () => Promise<void>
  readonly launchPromptSession: (prompt: string) => Promise<void>
}

export type HowToLivePageProps = PropsRuntime<'main'>
  & InjectFace<HowToLivePageInjected>
  & PropsLocale<'howtolive'>

/**
 * 「人生补丁」主视图页面：顶部仪表盘（六维雷达 + 等级进度 + 今日一抽）+ 多维筛选列表 + 详情抽屉。
 */
export function HowToLivePage(props: HowToLivePageProps) {
  const {
    useHowtolive,
    ensureLoaded,
    refresh,
    refreshState,
    openItemDetail,
    goBackItemDetail,
    closeItemDetail,
    setItemProgress,
    setItemsProgressBatch,
    saveProfile,
    rerollDaily,
    exportMarkdown,
    syncUpstream,
    launchPromptSession,
    t,
  } = props

  const snap = useHowtolive((s) => s)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileGuideForCheckup, setProfileGuideForCheckup] = useState(false)
  const [sprintOpen, setSprintOpen] = useState(false)
  const [badgesOpen, setBadgesOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [skipWizardOpen, setSkipWizardOpen] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)

  const pageScrollRef = useRef<HTMLDivElement>(null)
  const filterSectionRef = useRef<HTMLDivElement>(null)
  const lastFocusRefreshRef = useRef<number>(Date.now())
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastSeqRef = useRef(0)

  const clearToastTimer = useCallback(() => {
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
  }, [])

  const showToast = useCallback(
    (
      message: string,
      options?: {
        tone?: 'success' | 'info' | 'error'
        durationMs?: number
        action?: { label: string; onClick: () => void }
      },
    ) => {
      clearToastTimer()
      const id = ++toastSeqRef.current
      setToast({
        id,
        message,
        tone: options?.tone ?? 'success',
        ...(options?.action ? { action: options.action } : {}),
      })
      const duration = options?.durationMs ?? 3200
      toastTimerRef.current = setTimeout(() => {
        setToast((cur) => (cur?.id === id ? null : cur))
        toastTimerRef.current = null
      }, duration)
    },
    [clearToastTimer],
  )

  useEffect(() => {
    return () => {
      clearToastTimer()
    }
  }, [clearToastTimer])

  useEffect(() => {
    void ensureLoaded()
    const handleFocus = () => {
      const now = Date.now()
      if (now - lastFocusRefreshRef.current < FOCUS_REFRESH_THROTTLE_MS) return
      lastFocusRefreshRef.current = now
      void (refreshState ? refreshState() : refresh())
    }
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [ensureLoaded, refresh, refreshState])

  // 筛选条件改变时重置分页窗口，避免列表位置错乱
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filters])

  const filteredItems = useMemo(() => {
    const tokens = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const progress = snap.state?.progress ?? {}

    const matched = snap.items.filter((item) => {
      if (filters.dimension !== 'all' && item.dimension !== filters.dimension) return false
      if (filters.chapterNumber !== 'all' && item.chapterNumber !== filters.chapterNumber) return false
      if (filters.tier !== 'all' && item.roiTier !== filters.tier) return false
      if (filters.zeroCostOnly && item.tags?.money !== '0') return false
      if (filters.gradeAOnly && !item.evidenceGrade.trim().toUpperCase().startsWith('A')) return false
      if (filters.audience && !(item.tags?.audience ?? []).some((a) => a.includes(filters.audience))) {
        return false
      }
      const status: ItemStatus = progress[item.id]?.status ?? 'todo'
      if (filters.status !== 'all' && status !== filters.status) return false
      if (filters.dueReviewOnly && !isItemDueForReview(progress[item.id])) return false

      if (tokens.length > 0) {
        const hay = `${item.id} ${item.title} ${item.plain} ${item.cost} ${item.chapterTitle} ${item.topic ?? ''} ${(item.tags?.audience ?? []).join(' ')}`.toLowerCase()
        for (const tok of tokens) {
          if (!hay.includes(tok)) return false
        }
      }
      return true
    })

    if (filters.sort === 'chapter') {
      return matched
    }

    const compareByBook = (a: KnowledgeItemSummary, b: KnowledgeItemSummary) =>
      a.chapterNumber - b.chapterNumber || a.number - b.number

    return [...matched].sort((a, b) => {
      switch (filters.sort) {
        case 'roi':
          return TIER_RANK[a.roiTier] - TIER_RANK[b.roiTier]
            || b.roiScore - a.roiScore
            || compareByBook(a, b)
        case 'zeroCost': {
          const aZero = a.tags?.money === '0' ? 0 : 1
          const bZero = b.tags?.money === '0' ? 0 : 1
          const aNoWill = a.tags?.willpower === '否' ? 0 : 1
          const bNoWill = b.tags?.willpower === '否' ? 0 : 1
          return aZero - bZero || aNoWill - bNoWill || b.roiScore - a.roiScore || compareByBook(a, b)
        }
        case 'xp':
          return b.xp - a.xp || b.roiScore - a.roiScore || compareByBook(a, b)
        case 'noted': {
          const aNoted = progress[a.id]?.note?.trim() ? 0 : 1
          const bNoted = progress[b.id]?.note?.trim() ? 0 : 1
          return aNoted - bNoted || compareByBook(a, b)
        }
        default:
          return compareByBook(a, b)
      }
    })
  }, [snap.items, snap.state?.progress, filters])

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  )

  // 按当前维度/章节/关键词/高级筛选范围过滤（不受 status 限制），供漏洞扫描与关系星图共用
  const scopedItems = useMemo(() => {
    const tokens = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return snap.items.filter((item) => {
      if (filters.dimension !== 'all' && item.dimension !== filters.dimension) return false
      if (filters.chapterNumber !== 'all' && item.chapterNumber !== filters.chapterNumber) return false
      if (filters.tier !== 'all' && item.roiTier !== filters.tier) return false
      if (filters.zeroCostOnly && item.tags?.money !== '0') return false
      if (filters.gradeAOnly && !item.evidenceGrade.trim().toUpperCase().startsWith('A')) return false
      if (filters.audience && !(item.tags?.audience ?? []).some((a) => a.includes(filters.audience))) {
        return false
      }
      if (tokens.length > 0) {
        const hay = `${item.id} ${item.title} ${item.plain} ${item.cost} ${item.chapterTitle} ${item.topic ?? ''} ${(item.tags?.audience ?? []).join(' ')}`.toLowerCase()
        for (const tok of tokens) {
          if (!hay.includes(tok)) return false
        }
      }
      return true
    })
  }, [snap.items, filters])

  const cveReport = useMemo(
    () => scanLifeVulnerabilities(scopedItems, snap.state?.progress ?? {}, snap.state?.profile),
    [scopedItems, snap.state?.progress, snap.state?.profile],
  )

  const skipAnalysis = useMemo(
    () => findProfileSkipCandidates(snap.items, snap.state?.progress ?? {}, snap.state?.profile),
    [snap.items, snap.state?.progress, snap.state?.profile],
  )

  const badges = useMemo(
    () => computeBadges(snap.items, snap.state?.progress ?? {}, snap.summary ?? undefined),
    [snap.items, snap.state?.progress, snap.summary],
  )
  const unlockedBadgeCount = useMemo(
    () => badges.filter((b) => b.unlocked).length,
    [badges],
  )
  const dueReviewCount = useMemo(
    () => snap.summary?.dueReviewCount ?? countDueReviewItems(snap.items, snap.state?.progress ?? {}),
    [snap.summary?.dueReviewCount, snap.items, snap.state?.progress],
  )

  const handleUpdateProgress = useCallback(
    async (id: string, patch: ItemProgressPatch) => {
      const prevLevel = snap.summary?.level.level ?? 1
      const prevStatus: ItemStatus = snap.state?.progress[id]?.status ?? 'todo'
      setBusyId(id)
      try {
        const res = (await setItemProgress(id, patch)) as Partial<ProgressUpdateResult> | undefined
        if (patch.status === 'done' && prevStatus !== 'done') {
          const xpDelta = typeof res?.xpDelta === 'number' ? res.xpDelta : 0
          const afterLevel = res?.summary?.level
          if (xpDelta > 0 && afterLevel && afterLevel.level > prevLevel) {
            showToast(
              t('toast.levelUp', {
                xp: xpDelta,
                prev: prevLevel,
                level: afterLevel.level,
                title: afterLevel.title,
              }),
              { tone: 'success', durationMs: 4200 },
            )
          } else if (xpDelta > 0) {
            showToast(t('toast.xpGain', { xp: xpDelta }), { tone: 'success', durationMs: 2600 })
          }
        } else if (patch.status === 'skipped' && prevStatus !== 'skipped') {
          showToast(t('toast.skipped'), {
            tone: 'info',
            durationMs: 4000,
            action: {
              label: t('toast.undo'),
              onClick: () => {
                clearToastTimer()
                setToast(null)
                void setItemProgress(id, { status: prevStatus })
                  .then(() => {
                    showToast(t('toast.undone'), { tone: 'info', durationMs: 2000 })
                  })
                  .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : String(err)
                    showToast(t('toast.updateError', { message }), { tone: 'error', durationMs: 4000 })
                  })
              },
            },
          })
        } else if (patch.lastReviewedAt && patch.status === undefined && patch.reviewIntervalDays === undefined) {
          showToast(t('review.reviewedToast'), { tone: 'success', durationMs: 2400 })
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        showToast(t('toast.updateError', { message }), { tone: 'error', durationMs: 4000 })
        throw err
      } finally {
        setBusyId(null)
      }
    },
    [snap.summary?.level.level, snap.state?.progress, setItemProgress, showToast, clearToastTimer, t],
  )

  const hasProfile = useMemo(() => {
    const p = snap.state?.profile
    if (!p) return false
    return Boolean(
      p.ageGroup
      || p.occupation
      || p.housing
      || (p.family && p.family.length > 0)
      || (p.goals && p.goals.length > 0)
      || p.customNote?.trim(),
    )
  }, [snap.state?.profile])

  const handleExport = async () => {
    const { filename, markdown } = await exportMarkdown()
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    showToast(t('action.exportDone'), { tone: 'success' })
  }

  const handleSync = async () => {
    try {
      await syncUpstream()
      showToast(t('page.syncSuccess'), { tone: 'success' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast(t('page.syncError', { message }), { tone: 'error', durationMs: 4200 })
    }
  }

  const runCheckup = (profileOverride?: UserProfile) => {
    const profile = profileOverride ?? snap.state?.profile ?? {}
    const prompt = buildCheckupPrompt(profile, snap.summary ?? undefined)
    void launchPromptSession(prompt)
  }

  const handleCheckupClick = () => {
    if (!hasProfile) {
      setProfileGuideForCheckup(true)
      setProfileOpen(true)
      return
    }
    runCheckup()
  }

  const handleScenario = (scenario: ScenarioPreset) => {
    const profile = snap.state?.profile ?? {}
    const prompt = buildScenarioPrompt(scenario, profile)
    void launchPromptSession(prompt)
  }

  const handleStartChaosDrill = () => {
    const profile = snap.state?.profile ?? {}
    const progress = snap.state?.progress ?? {}
    const candidates = selectChaosDrillCandidates(snap.items, progress, profile, 4)
    const prompt = buildChaosDrillPrompt(profile, snap.summary ?? undefined, candidates)
    void launchPromptSession(prompt)
  }

  const handleAskAiForItem = (item: KnowledgeItem | KnowledgeItemSummary) => {
    const profile = snap.state?.profile ?? {}
    const prompt = buildItemActionPrompt(item, profile)
    closeItemDetail()
    void launchPromptSession(prompt)
  }

  const handlePlanWeekend = () => {
    const profile = snap.state?.profile ?? {}
    const progress = snap.state?.progress ?? {}
    const plannedPool = filters.status === 'planned' && filteredItems.length > 0
      ? filteredItems
      : snap.items.filter((item) => (progress[item.id]?.status ?? 'todo') === 'planned')
    if (plannedPool.length === 0) return
    const prompt = buildWeekendPlanPrompt(plannedPool, profile, snap.summary ?? undefined)
    void launchPromptSession(prompt)
  }

  const handleBatchSkip = async (itemIds: string[]) => {
    if (itemIds.length === 0) return
    const updates = itemIds.map((id) => ({ id, status: 'skipped' as const }))
    try {
      if (setItemsProgressBatch) {
        await setItemsProgressBatch(updates)
      } else {
        for (const entry of updates) {
          await setItemProgress(entry.id, { status: entry.status })
        }
      }
      showToast(t('skipWizard.doneToast', { count: itemIds.length }), {
        tone: 'info',
        durationMs: 3600,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showToast(t('toast.updateError', { message }), { tone: 'error', durationMs: 4000 })
      throw err
    }
  }

  const handleSelectRadarDimension = (dim: FilterState['dimension']) => {
    setFilters((prev) => ({ ...prev, dimension: dim, chapterNumber: 'all' }))
    if (dim !== 'all') {
      filterSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleFilterDueReview = () => {
    setViewMode('cards')
    setFilters((prev) => ({ ...prev, status: 'done', dueReviewOnly: true }))
    filterSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handlePageScroll = () => {
    const top = pageScrollRef.current?.scrollTop ?? 0
    setShowBackToTop(top > 480)
  }

  const scrollToTop = () => {
    pageScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const selectedSummary = useMemo(
    () => (snap.selectedItemId ? snap.items.find((i) => i.id === snap.selectedItemId) ?? null : null),
    [snap.selectedItemId, snap.items],
  )

  return (
    <div className={css.page}>
      <div ref={pageScrollRef} className={css.pageScroll} onScroll={handlePageScroll}>
        <div className={css.pageContent}>
          <header className={css.pageHeading}>
            <div className={css.brandCluster}>
              <div className={css.brandMark} aria-hidden="true">
                <IconShieldCheck size={20} />
              </div>
              <div className={css.headingTitleWrap}>
                <h1>{t('page.title')}</h1>
                <p className={css.subtitle}>{t('page.subtitle')}</p>
              </div>
            </div>
            <div className={css.toolbar}>
              <Button
                variant="outline"
                size="sm"
                icon={<IconUser size={14} />}
                onClick={() => {
                  setProfileGuideForCheckup(false)
                  setProfileOpen(true)
                }}
                disabled={snap.status !== 'ready'}
              >
                {hasProfile ? t('action.profileConfigured') : t('action.profile')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<IconShareCard size={14} />}
                onClick={() => setShareOpen(true)}
                disabled={snap.status !== 'ready' || !snap.summary}
              >
                {t('action.shareCard')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<IconDownload size={14} />}
                onClick={() => void handleExport()}
                disabled={snap.status !== 'ready'}
              >
                {t('action.export')}
              </Button>
              <Button
                className={css.checkupBtn}
                variant="primary"
                size="sm"
                icon={<IconSparkles size={14} />}
                onClick={handleCheckupClick}
                disabled={snap.status !== 'ready'}
              >
                {t('action.checkup')}
              </Button>
            </div>
          </header>

          {snap.status === 'loading' || snap.status === 'idle' ? (
            <div className={css.stateCard}>{t('page.loading')}</div>
          ) : snap.status === 'error' ? (
            <div className={css.stateCard}>
              <span>{t('page.loadError', { message: snap.error ?? 'Unknown error' })}</span>
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                {t('page.retry')}
              </Button>
            </div>
          ) : (
            <>
              {snap.summary && (
                <div className={css.dashboardGrid}>
                  <LifeRadarCard
                    summary={snap.summary}
                    activeDimension={filters.dimension}
                    onSelectDimension={handleSelectRadarDimension}
                    badgeUnlockedCount={unlockedBadgeCount}
                    badgeTotalCount={badges.length}
                    onOpenBadges={() => setBadgesOpen(true)}
                    dueReviewCount={dueReviewCount}
                    onFilterDueReview={handleFilterDueReview}
                    t={t}
                  />
                  <DailyPickCard
                    item={snap.dailyPickItem}
                    itemStatus={snap.dailyPickItem ? (snap.state?.progress[snap.dailyPickItem.id]?.status ?? 'todo') : 'todo'}
                    xpFeedback={snap.xpFeedback}
                    onMarkStatus={async (id, status) => {
                      await handleUpdateProgress(id, { status })
                    }}
                    onReroll={rerollDaily}
                    onOpenDetail={(id) => void openItemDetail(id)}
                    onOpenSprint={() => setSprintOpen(true)}
                    t={t}
                  />
                </div>
              )}

              <ScenarioBar
                onSelectScenario={handleScenario}
                onStartChaosDrill={handleStartChaosDrill}
                t={t}
              />

              {snap.meta && (
                <div ref={filterSectionRef}>
                  <FilterBar
                    filters={filters}
                    dimensions={snap.meta.dimensions}
                    chapters={snap.chapters}
                    audiences={snap.meta.stats.topAudiences}
                    shownCount={
                      viewMode === 'cve'
                        ? cveReport.vulnerabilities.length
                        : viewMode === 'graph'
                          ? scopedItems.length
                          : filteredItems.length
                    }
                    totalCount={snap.items.length}
                    skippedCount={snap.summary?.skippedCount ?? 0}
                    shortcutEnabled={
                      !profileOpen
                      && !sprintOpen
                      && !badgesOpen
                      && !shareOpen
                      && !skipWizardOpen
                      && snap.selectedItemId === null
                    }
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    cveCriticalCount={cveReport.criticalCount}
                    dueReviewCount={dueReviewCount}
                    onPlanWeekend={handlePlanWeekend}
                    skipCandidateCount={skipAnalysis.totalCount}
                    onOpenSkipWizard={() => setSkipWizardOpen(true)}
                    onChange={setFilters}
                    t={t}
                  />
                </div>
              )}

              {viewMode === 'cve' ? (
                <CveScannerView
                  report={cveReport}
                  busyId={busyId}
                  onSetStatus={(id, status) => {
                    void handleUpdateProgress(id, { status }).catch(() => undefined)
                  }}
                  onOpenDetail={(id) => void openItemDetail(id)}
                  t={t}
                />
              ) : viewMode === 'graph' ? (
                <PatchGraphView
                  items={scopedItems}
                  progress={snap.state?.progress ?? {}}
                  dimensions={snap.meta?.dimensions ?? []}
                  activeDimension={filters.dimension}
                  onOpenDetail={(id) => void openItemDetail(id)}
                  t={t}
                />
              ) : (
                <section className={css.listSection} aria-label={t('page.title')}>
                  {visibleItems.length === 0 ? (
                    <div className={css.stateCard}>{t('item.listEmpty')}</div>
                  ) : (
                    <div className={css.listGrid}>
                      {visibleItems.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          progress={snap.state?.progress[item.id]}
                          busy={busyId === item.id}
                          onSetStatus={(id, status) => {
                            void handleUpdateProgress(id, { status }).catch(() => undefined)
                          }}
                          onReviewItem={(id) => {
                            void handleUpdateProgress(id, { lastReviewedAt: new Date().toISOString() }).catch(() => undefined)
                          }}
                          onOpenDetail={(id) => void openItemDetail(id)}
                          t={t}
                        />
                      ))}
                    </div>
                  )}

                  {visibleCount < filteredItems.length && (
                    <div className={css.loadMoreWrap}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      >
                        {t('item.loadMore', { remaining: filteredItems.length - visibleCount })}
                      </Button>
                    </div>
                  )}
                </section>
              )}

              <footer className={css.footer}>
                <div className={css.footerLinks}>
                  <span>{t('footer.attribution')}</span>
                  {snap.meta && (
                    <>
                      <a
                        className={css.footerLink}
                        href={snap.meta.upstream.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        GitHub ({snap.meta.upstream.commitSha ? snap.meta.upstream.commitSha.slice(0, 7) : 'local'})
                      </a>
                      <span>· {snap.meta.generatedAt.slice(0, 10)}</span>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<IconRefresh size={13} />}
                    disabled={snap.syncing}
                    onClick={() => void handleSync()}
                  >
                    {snap.syncing ? t('page.syncing') : t('page.refresh')}
                  </Button>
                </div>
                <span>{t('footer.disclaimer')}</span>
              </footer>
            </>
          )}
        </div>
      </div>

      {showBackToTop && (
        <button
          type="button"
          className={css.backToTopBtn}
          aria-label={t('page.backToTop')}
          title={t('page.backToTop')}
          onClick={scrollToTop}
        >
          <IconArrowUp size={15} />
          <span>{t('page.backToTop')}</span>
        </button>
      )}

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={clsx(
            css.toast,
            toast.tone === 'error' && css.toastError,
            toast.tone === 'info' && css.toastInfo,
          )}
        >
          <span className={css.toastMessage}>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className={css.toastActionBtn}
              onClick={toast.action.onClick}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      <ProfileModal
        open={profileOpen}
        profile={snap.state?.profile ?? {}}
        onClose={() => {
          setProfileOpen(false)
          setProfileGuideForCheckup(false)
        }}
        onSave={saveProfile}
        onSaveAndCheckup={async (profile) => {
          await saveProfile(profile)
          setProfileOpen(false)
          setProfileGuideForCheckup(false)
          runCheckup(profile)
        }}
        onSaveAndScreenSkip={async (profile) => {
          await saveProfile(profile)
          setProfileOpen(false)
          setProfileGuideForCheckup(false)
          setSkipWizardOpen(true)
        }}
        {...(profileGuideForCheckup
          ? {
              onSkipToCheckup: () => {
                setProfileOpen(false)
                setProfileGuideForCheckup(false)
                runCheckup({})
              },
            }
          : {})}
        t={t}
      />

      <PatchSprintModal
        open={sprintOpen}
        items={snap.items}
        progress={snap.state?.progress ?? {}}
        summary={snap.summary}
        profile={snap.state?.profile ?? {}}
        detailOpen={snap.selectedItemId !== null}
        onClose={() => setSprintOpen(false)}
        onMarkStatus={async (id, status) => {
          await handleUpdateProgress(id, { status })
        }}
        onOpenDetail={(id) => void openItemDetail(id)}
        t={t}
      />

      <BadgesModal
        open={badgesOpen}
        badges={badges}
        onClose={() => setBadgesOpen(false)}
        t={t}
      />

      <ShareCardModal
        open={shareOpen}
        summary={snap.summary}
        items={snap.items}
        progress={snap.state?.progress ?? {}}
        profile={snap.state?.profile}
        onClose={() => setShareOpen(false)}
        onNotify={(msg, tone) => showToast(msg, { tone: tone ?? 'success' })}
        t={t}
      />

      <ProfileSkipWizardModal
        open={skipWizardOpen}
        analysis={skipAnalysis}
        onClose={() => setSkipWizardOpen(false)}
        onConfirmSkip={handleBatchSkip}
        t={t}
      />

      <ItemDetailDrawer
        open={snap.selectedItemId !== null}
        loading={snap.detailLoading}
        summaryItem={selectedSummary}
        detail={snap.selectedItemId ? (snap.detailCache[snap.selectedItemId] ?? null) : null}
        progress={snap.selectedItemId ? snap.state?.progress[snap.selectedItemId] : undefined}
        canGoBack={(snap.detailHistory?.length ?? 0) > 0 && goBackItemDetail !== undefined}
        onGoBack={() => {
          if (goBackItemDetail) void goBackItemDetail()
        }}
        onClose={closeItemDetail}
        onJumpToItem={(id) => void openItemDetail(id, { pushHistory: true })}
        onAskAi={handleAskAiForItem}
        onUpdateProgress={async (id, patch) => {
          await handleUpdateProgress(id, patch)
        }}
        t={t}
      />
    </div>
  )
}

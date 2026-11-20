import { useEffect, useMemo, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { buildCheckupPrompt, buildScenarioPrompt } from '../../shared/scenarios.ts'
import type { ItemStatus, ScenarioPreset, UserProfile } from '../../shared/types.ts'
import type { HowToLiveViewSnapshot } from '../store.ts'
import { DailyPickCard } from './DailyPickCard.tsx'
import { DEFAULT_FILTERS, FilterBar, type FilterState } from './FilterBar.tsx'
import { IconDownload, IconRefresh, IconShieldCheck, IconSparkles, IconUser } from './Icons.tsx'
import { ItemCard } from './ItemCard.tsx'
import { ItemDetailDrawer } from './ItemDetailDrawer.tsx'
import { LifeRadarCard } from './LifeRadarCard.tsx'
import { ProfileModal } from './ProfileModal.tsx'
import { ScenarioBar } from './ScenarioBar.tsx'
import css from './HowToLivePage.module.css'

const PAGE_SIZE = 30

export interface HowToLivePageInjected {
  readonly hooks: {
    readonly howtolive: HostObservable<HowToLiveViewSnapshot>
  }
  readonly ensureLoaded: () => Promise<void>
  readonly refresh: () => Promise<void>
  readonly openItemDetail: (id: string) => Promise<void>
  readonly closeItemDetail: () => void
  readonly setItemProgress: (id: string, patch: { status?: ItemStatus; note?: string }) => Promise<unknown>
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
    openItemDetail,
    closeItemDetail,
    setItemProgress,
    saveProfile,
    rerollDaily,
    exportMarkdown,
    syncUpstream,
    launchPromptSession,
    t,
  } = props

  const snap = useHowtolive((s) => s)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    void ensureLoaded()
    const handleFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [ensureLoaded, refresh])

  // 筛选条件改变时重置分页窗口，避免列表位置错乱
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filters])

  const filteredItems = useMemo(() => {
    const tokens = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const progress = snap.state?.progress ?? {}

    return snap.items.filter((item) => {
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

      if (tokens.length > 0) {
        const hay = `${item.id} ${item.title} ${item.plain} ${item.cost} ${item.chapterTitle} ${item.topic ?? ''} ${(item.tags?.audience ?? []).join(' ')}`.toLowerCase()
        for (const tok of tokens) {
          if (!hay.includes(tok)) return false
        }
      }
      return true
    })
  }, [snap.items, snap.state?.progress, filters])

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  )

  const handleSetStatus = async (id: string, status: ItemStatus) => {
    setBusyId(id)
    try {
      await setItemProgress(id, { status })
    } finally {
      setBusyId(null)
    }
  }

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

  const showTempNotice = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 3200)
  }

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
    showTempNotice(t('action.exportDone'))
  }

  const handleSync = async () => {
    try {
      await syncUpstream()
      showTempNotice(t('page.syncSuccess'))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      showTempNotice(t('page.syncError', { message }))
    }
  }

  const handleCheckup = (profileOverride?: UserProfile) => {
    const profile = profileOverride ?? snap.state?.profile ?? {}
    const prompt = buildCheckupPrompt(profile, snap.summary ?? undefined)
    void launchPromptSession(prompt)
  }

  const handleScenario = (scenario: ScenarioPreset) => {
    const profile = snap.state?.profile ?? {}
    const prompt = buildScenarioPrompt(scenario, profile)
    void launchPromptSession(prompt)
  }

  const selectedSummary = useMemo(
    () => (snap.selectedItemId ? snap.items.find((i) => i.id === snap.selectedItemId) ?? null : null),
    [snap.selectedItemId, snap.items],
  )

  return (
    <div className={css.page}>
      <div className={css.pageScroll}>
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
                onClick={() => setProfileOpen(true)}
                disabled={snap.status !== 'ready'}
              >
                {hasProfile ? t('action.profileConfigured') : t('action.profile')}
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
                onClick={() => handleCheckup()}
                disabled={snap.status !== 'ready'}
              >
                {t('action.checkup')}
              </Button>
            </div>
          </header>

          {notice && <div className={css.noticeBanner}>{notice}</div>}

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
                    onSelectDimension={(dim) => setFilters((prev) => ({ ...prev, dimension: dim, chapterNumber: 'all' }))}
                    t={t}
                  />
                  <DailyPickCard
                    item={snap.dailyPickItem}
                    itemStatus={snap.dailyPickItem ? (snap.state?.progress[snap.dailyPickItem.id]?.status ?? 'todo') : 'todo'}
                    xpFeedback={snap.xpFeedback}
                    onMarkStatus={async (id, status) => {
                      await setItemProgress(id, { status })
                    }}
                    onReroll={rerollDaily}
                    onOpenDetail={(id) => void openItemDetail(id)}
                    t={t}
                  />
                </div>
              )}

              <ScenarioBar onSelectScenario={handleScenario} t={t} />

              {snap.meta && (
                <FilterBar
                  filters={filters}
                  dimensions={snap.meta.dimensions}
                  chapters={snap.chapters}
                  audiences={snap.meta.stats.topAudiences}
                  shownCount={filteredItems.length}
                  totalCount={snap.items.length}
                  skippedCount={snap.summary?.skippedCount ?? 0}
                  onChange={setFilters}
                  t={t}
                />
              )}

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
                        onSetStatus={(id, status) => void handleSetStatus(id, status)}
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

      <ProfileModal
        open={profileOpen}
        profile={snap.state?.profile ?? {}}
        onClose={() => setProfileOpen(false)}
        onSave={saveProfile}
        onSaveAndCheckup={async (profile) => {
          await saveProfile(profile)
          setProfileOpen(false)
          handleCheckup(profile)
        }}
        t={t}
      />

      <ItemDetailDrawer
        open={snap.selectedItemId !== null}
        loading={snap.detailLoading}
        summaryItem={selectedSummary}
        detail={snap.selectedItemId ? (snap.detailCache[snap.selectedItemId] ?? null) : null}
        progress={snap.selectedItemId ? snap.state?.progress[snap.selectedItemId] : undefined}
        onClose={closeItemDetail}
        onJumpToItem={(id) => void openItemDetail(id)}
        onUpdateProgress={async (id, patch) => {
          await setItemProgress(id, patch)
        }}
        t={t}
      />
    </div>
  )
}

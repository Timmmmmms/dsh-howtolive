import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  buildSprintDeck,
  countSprintModeAvailability,
  type SprintMode,
} from '../../shared/sprint.ts'
import type {
  ItemProgress,
  ItemStatus,
  KnowledgeItemSummary,
  ScoreSummary,
  UserProfile,
} from '../../shared/types.ts'
import type { HowToLiveLocaleKey } from '../locales.ts'
import {
  IconBookmark,
  IconCheck,
  IconChevronRight,
  IconEyeOff,
  IconRefresh,
  IconSparkles,
  IconZap,
} from './Icons.tsx'
import css from './PatchSprintModal.module.css'

export interface PatchSprintModalProps {
  readonly open: boolean
  readonly items: readonly KnowledgeItemSummary[]
  readonly progress: Readonly<Record<string, ItemProgress | undefined>>
  readonly summary: ScoreSummary | null
  readonly profile: UserProfile
  /** 详情抽屉处于打开态时暂停键盘快捷操作，避免冲突 */
  readonly detailOpen?: boolean
  readonly onClose: () => void
  readonly onMarkStatus: (id: string, status: ItemStatus) => Promise<void>
  readonly onOpenDetail: (id: string) => void
  readonly t: TranslateNS<'howtolive'>
}

interface SprintStats {
  readonly done: number
  readonly planned: number
  readonly skipped: number
  readonly earnedXp: number
}

const EMPTY_STATS: SprintStats = { done: 0, planned: 0, skipped: 0, earnedXp: 0 }

const MODE_OPTIONS: ReadonlyArray<{ readonly id: SprintMode; readonly labelKey: HowToLiveLocaleKey }> = [
  { id: 'zeroCost', labelKey: 'sprint.mode.zeroCost' },
  { id: 'weakest', labelKey: 'sprint.mode.weakest' },
  { id: 'planned', labelKey: 'sprint.mode.planned' },
]

/**
 * 「摸鱼 3 分钟速刷盲盒」（Patch Sprint）沉浸式单卡弹窗：
 * - 3 个模式：零花钱不靠毅力 / 薄弱维度突击 / 行动清单清仓
 * - 支持键盘快捷操作：→ 已做到、↑ 加入清单、← 不适用、Space 查看详情、Esc 退出
 * - 维护当次会话 Combo 连击计数、进度条与战绩结算卡
 */
export function PatchSprintModal({
  open,
  items,
  progress,
  summary,
  profile,
  detailOpen = false,
  onClose,
  onMarkStatus,
  onOpenDetail,
  t,
}: PatchSprintModalProps) {
  const [mode, setMode] = useState<SprintMode>('zeroCost')
  const [deck, setDeck] = useState<KnowledgeItemSummary[]>([])
  const [index, setIndex] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [stats, setStats] = useState<SprintStats>(EMPTY_STATS)
  const [busy, setBusy] = useState(false)

  // 用 ref 读取最新数据源，避免 progress 变更时覆盖正在进行中的卡池
  const latestDataRef = useRef({ items, progress, summary, profile })
  latestDataRef.current = { items, progress, summary, profile }

  const availability = useMemo(
    () => countSprintModeAvailability(items, progress, summary),
    [items, progress, summary],
  )

  const startRound = useCallback((targetMode: SprintMode, excludeIds?: ReadonlySet<string>) => {
    const { items: curItems, progress: curProgress, summary: curSummary, profile: curProfile } = latestDataRef.current
    const nextDeck = buildSprintDeck({
      mode: targetMode,
      items: curItems,
      progress: curProgress,
      summary: curSummary,
      profile: curProfile,
      ...(excludeIds ? { excludeIds } : {}),
      limit: 8,
    })
    setMode(targetMode)
    setDeck(nextDeck)
    setIndex(0)
    setCombo(0)
    setMaxCombo(0)
    setStats(EMPTY_STATS)
  }, [])

  // 打开弹窗时初始化卡池（若默认模式为空则自动切到有数据的模式）
  useEffect(() => {
    if (!open) return
    const counts = countSprintModeAvailability(
      latestDataRef.current.items,
      latestDataRef.current.progress,
      latestDataRef.current.summary,
    )
    const initialMode: SprintMode =
      counts.zeroCost > 0
        ? 'zeroCost'
        : counts.weakest > 0
          ? 'weakest'
          : counts.planned > 0
            ? 'planned'
            : 'zeroCost'
    startRound(initialMode)
  }, [open, startRound])

  const finished = deck.length > 0 && index >= deck.length
  const currentItem = !finished && deck.length > 0 ? (deck[index] ?? null) : null
  const processedCount = stats.done + stats.planned + stats.skipped

  const handleAction = useCallback(
    async (status: 'done' | 'planned' | 'skipped') => {
      if (!currentItem || busy) return
      setBusy(true)
      try {
        await onMarkStatus(currentItem.id, status)
        setStats((prev) => ({
          done: prev.done + (status === 'done' ? 1 : 0),
          planned: prev.planned + (status === 'planned' ? 1 : 0),
          skipped: prev.skipped + (status === 'skipped' ? 1 : 0),
          earnedXp: prev.earnedXp + (status === 'done' ? currentItem.xp : 0),
        }))
        if (status === 'done' || status === 'planned') {
          setCombo((prev) => {
            const next = prev + 1
            setMaxCombo((m) => Math.max(m, next))
            return next
          })
        } else {
          setCombo(0)
        }
        setIndex((i) => i + 1)
      } catch {
        // 错误提示与状态回滚已由上层 store / HowToLivePage 处理
      } finally {
        setBusy(false)
      }
    },
    [currentItem, busy, onMarkStatus],
  )

  // 键盘快捷操作：→ done / ↑ planned / ← skipped / Space 详情 / Esc 退出
  useEffect(() => {
    if (!open || detailOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
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

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (!currentItem || busy) return

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        void handleAction('done')
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        void handleAction('planned')
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        void handleAction('skipped')
      } else if (e.key === ' ') {
        e.preventDefault()
        onOpenDetail(currentItem.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, detailOpen, currentItem, busy, handleAction, onOpenDetail, onClose])

  const progressPct = deck.length > 0 ? Math.min(100, Math.round((index / deck.length) * 100)) : 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('sprint.title')}
      description={t('sprint.desc')}
      closeLabel={t('drawer.close')}
      className={css.modal}
      contentClassName={css.content}
      footer={
        <div className={css.modalFooter}>
          <span className={css.shortcutsHint}>{t('sprint.shortcutsHint')}</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('drawer.close')}
          </Button>
        </div>
      }
    >
      {/* 模式切换胶囊 */}
      <div className={css.modeBar} role="group" aria-label={t('sprint.title')}>
        {MODE_OPTIONS.map((opt) => {
          const active = mode === opt.id
          const count = availability[opt.id]
          return (
            <button
              key={opt.id}
              type="button"
              className={clsx(css.modeBtn, active && css.modeBtnActive)}
              aria-pressed={active}
              disabled={busy}
              onClick={() => startRound(opt.id)}
            >
              <span>{t(opt.labelKey)}</span>
              <span className={css.modeCount}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* 进度条与 Combo 连击计数 */}
      {deck.length > 0 && (
        <div className={css.statusRow}>
          <div className={css.progressWrap}>
            <div className={css.progressHead}>
              <span className={css.progressLabel}>
                {t('sprint.progress', {
                  current: Math.min(index + 1, deck.length),
                  total: deck.length,
                })}
              </span>
              {combo > 0 && (
                <span key={combo} className={css.comboBadge}>
                  <IconZap size={12} />
                  <span>{t('sprint.combo', { count: combo })}</span>
                </span>
              )}
            </div>
            <div className={css.progressTrack} aria-hidden="true">
              <div className={css.progressFill} style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* 主区域：空池 / 结算卡 / 当前盲盒卡片 */}
      {deck.length === 0 ? (
        <div className={css.emptyCard}>
          <span className={css.emptyIcon} aria-hidden="true">
            <IconSparkles size={22} />
          </span>
          <h3 className={css.emptyTitle}>{t('sprint.emptyTitle')}</h3>
          <p className={css.emptyDesc}>{t('sprint.emptyDesc')}</p>
        </div>
      ) : finished ? (
        <div className={css.summaryCard}>
          <span className={css.summaryIcon} aria-hidden="true">
            <IconZap size={22} />
          </span>
          <h3 className={css.summaryTitle}>{t('sprint.summaryTitle')}</h3>

          <div className={css.summaryGrid}>
            <div className={css.summaryStat}>
              <span className={css.statLabel}>{t('sprint.summaryProcessed')}</span>
              <span className={css.statValue}>{processedCount}</span>
            </div>
            <div className={css.summaryStat}>
              <span className={css.statLabel}>{t('sprint.summaryXp')}</span>
              <span className={clsx(css.statValue, css.statXp)}>+{stats.earnedXp}</span>
            </div>
            <div className={css.summaryStat}>
              <span className={css.statLabel}>{t('sprint.summaryMaxCombo')}</span>
              <span className={clsx(css.statValue, css.statCombo)}>{maxCombo}x</span>
            </div>
          </div>

          <p className={css.breakdown}>
            {t('sprint.summaryBreakdown', {
              done: stats.done,
              planned: stats.planned,
              skipped: stats.skipped,
            })}
          </p>

          <div className={css.summaryActions}>
            <Button
              variant="primary"
              size="sm"
              icon={<IconRefresh size={14} />}
              onClick={() => startRound(mode)}
            >
              {t('sprint.anotherRound')}
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              {t('sprint.finish')}
            </Button>
          </div>
        </div>
      ) : currentItem ? (
        <div key={currentItem.id} className={css.sprintCard}>
          <div className={css.cardMeta}>
            <Tag tone={currentItem.roiTier === 'S' ? 'warning' : 'info'}>
              {t('item.tier', { tier: currentItem.roiTier })}
            </Tag>
            {currentItem.tags?.money === '0' && (
              <Tag tone="success">{t('item.moneyZero')}</Tag>
            )}
            {currentItem.tags?.willpower === '否' && (
              <Tag tone="neutral">{t('item.noWillpower')}</Tag>
            )}
            <span className={css.chapterText}>
              [{currentItem.id}] {currentItem.chapterTitle}
            </span>
          </div>

          <h3 className={css.cardTitle}>{currentItem.title}</h3>
          <p className={css.cardPlain}>{currentItem.plain}</p>

          {currentItem.cost && (
            <div className={css.costBox}>
              <span className={css.costLabel}>{t('drawer.cost')}</span>
              <span className={css.costValue}>{currentItem.cost}</span>
            </div>
          )}

          <div className={css.actionBar}>
            <button
              type="button"
              className={clsx(css.actionBtn, css.skipBtn)}
              disabled={busy}
              onClick={() => void handleAction('skipped')}
            >
              <IconEyeOff size={15} />
              <span>{t('sprint.action.skip')}</span>
              <kbd className={css.kbd}>←</kbd>
            </button>

            <button
              type="button"
              className={clsx(css.actionBtn, css.planBtn)}
              disabled={busy}
              onClick={() => void handleAction('planned')}
            >
              <IconBookmark size={15} />
              <span>{t('sprint.action.plan')}</span>
              <kbd className={css.kbd}>↑</kbd>
            </button>

            <button
              type="button"
              className={clsx(css.actionBtn, css.doneBtn)}
              disabled={busy}
              onClick={() => void handleAction('done')}
            >
              <IconCheck size={15} />
              <span>{t('sprint.action.done', { xp: currentItem.xp })}</span>
              <kbd className={css.kbd}>→</kbd>
            </button>
          </div>

          <div className={css.cardSubFooter}>
            <button
              type="button"
              className={css.detailBtn}
              onClick={() => onOpenDetail(currentItem.id)}
            >
              <span>{t('sprint.action.detail')}</span>
              <kbd className={css.kbdInline}>Space</kbd>
              <IconChevronRight size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

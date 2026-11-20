import { useState } from 'react'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ItemStatus, KnowledgeItemSummary } from '../../shared/types.ts'
import { IconCheck, IconChevronRight, IconRefresh, IconSparkles } from './Icons.tsx'
import css from './DailyPickCard.module.css'

export interface DailyPickCardProps {
  readonly item: KnowledgeItemSummary | null
  readonly itemStatus: ItemStatus
  readonly xpFeedback: { readonly id: string; readonly delta: number; readonly seq: number } | null
  readonly onMarkStatus: (id: string, status: ItemStatus) => Promise<void>
  readonly onReroll: () => Promise<void>
  readonly onOpenDetail: (id: string) => void
  readonly t: TranslateNS<'howtolive'>
}

/**
 * 「今日高性价比一抽」精选推荐卡：
 * - 杂志风留白与顶部微光强调，精简标签密度，突出核心建议与打卡成就感
 * - 切换条目时带丝滑淡入上浮动效，提升每日探索愉悦感
 */
export function DailyPickCard({
  item,
  itemStatus,
  xpFeedback,
  onMarkStatus,
  onReroll,
  onOpenDetail,
  t,
}: DailyPickCardProps) {
  const [busy, setBusy] = useState(false)
  const [rerolling, setRerolling] = useState(false)

  const handleAction = async (fn: () => Promise<void>, isReroll = false) => {
    if (busy) return
    setBusy(true)
    if (isReroll) setRerolling(true)
    try {
      await fn()
    } finally {
      setBusy(false)
      if (isReroll) setRerolling(false)
    }
  }

  const showXpBanner = xpFeedback !== null && item !== null && xpFeedback.id === item.id && xpFeedback.delta > 0

  return (
    <section className={css.card} aria-label={t('daily.title')}>
      <div className={css.accentBar} aria-hidden="true" />

      <div className={css.header}>
        <div className={css.titleRow}>
          <span className={css.titleIcon} aria-hidden="true">
            <IconSparkles size={15} />
          </span>
          <h2 className={css.title}>{t('daily.title')}</h2>
          {showXpBanner && (
            <span key={xpFeedback.seq} className={css.xpBanner}>
              {t('daily.xpToast', { xp: xpFeedback.delta })}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<IconRefresh size={14} className={rerolling ? css.spin : undefined} />}
          disabled={busy}
          onClick={() => void handleAction(onReroll, true)}
        >
          {t('daily.reroll')}
        </Button>
      </div>

      {item === null ? (
        <div className={css.emptyState}>{t('daily.empty')}</div>
      ) : (
        <>
          <div key={item.id} className={css.body}>
            <div className={css.metaRow}>
              <Tag tone={item.roiTier === 'S' ? 'warning' : 'info'}>
                {t('item.tier', { tier: item.roiTier })}
              </Tag>
              {item.tags?.money === '0' ? (
                <Tag tone="success">{t('item.moneyZero')}</Tag>
              ) : item.evidenceGrade && item.evidenceGrade.startsWith('A') ? (
                <Tag tone="success">{t('item.evidence', { grade: item.evidenceGrade })}</Tag>
              ) : null}
              <span className={css.chapterLabel}>{item.chapterTitle}</span>
            </div>

            <button
              type="button"
              className={css.titleTrigger}
              onClick={() => onOpenDetail(item.id)}
            >
              <h3 className={css.itemTitle}>{item.title}</h3>
            </button>

            <p className={css.plain}>{item.plain}</p>

            {item.cost && (
              <div className={css.costPill}>
                <span className={css.costLabel}>{t('drawer.cost')}</span>
                <span className={css.costText}>{item.cost}</span>
              </div>
            )}
          </div>

          <div className={css.footer}>
            <Button
              variant="primary"
              size="sm"
              icon={itemStatus === 'done' ? <IconCheck size={14} /> : undefined}
              disabled={busy || itemStatus === 'done'}
              onClick={() => void handleAction(() => onMarkStatus(item.id, 'done'))}
            >
              {itemStatus === 'done' ? t('turn.markedDone') : t('daily.markDone', { xp: item.xp })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || itemStatus === 'planned'}
              onClick={() => void handleAction(() => onMarkStatus(item.id, 'planned'))}
            >
              {itemStatus === 'planned' ? t('turn.markedPlanned') : t('daily.markPlanned')}
            </Button>
            <button
              type="button"
              className={css.detailLink}
              onClick={() => onOpenDetail(item.id)}
            >
              <span>{t('daily.viewDetail')}</span>
              <IconChevronRight size={14} />
            </button>
          </div>
        </>
      )}
    </section>
  )
}

import clsx from 'clsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ItemProgress, ItemStatus, KnowledgeItemSummary } from '../../shared/types.ts'
import { IconBookmark, IconCheck, IconChevronRight, IconEyeOff } from './Icons.tsx'
import css from './ItemCard.module.css'

export interface ItemCardProps {
  readonly item: KnowledgeItemSummary
  readonly progress?: ItemProgress | undefined
  readonly busy?: boolean
  readonly onSetStatus: (id: string, status: ItemStatus) => void
  readonly onOpenDetail: (id: string) => void
  readonly t: TranslateNS<'howtolive'>
}

function tierBadgeClass(tier: KnowledgeItemSummary['roiTier']): string {
  if (tier === 'S') return css.tierS ?? ''
  if (tier === 'A') return css.tierA ?? ''
  return css.tierDefault ?? ''
}

/**
 * 杂志风循证补丁卡片：
 * - 极简信息层级：顶部仅展示核心性价比微章 + 最多 1 个亮点 + XP，告别标签堆砌
 * - 中部大呼吸感标题与 2 行摘要，点击直达完整循证抽屉
 * - 底部精致打卡切换与轻量辅助图标按钮
 */
export function ItemCard({
  item,
  progress,
  busy = false,
  onSetStatus,
  onOpenDetail,
  t,
}: ItemCardProps) {
  const status: ItemStatus = progress?.status ?? 'todo'

  // 只挑选 1 个最具吸引力的亮点标签，避免视觉噪音
  const highlightLabel = item.tags?.money === '0'
    ? t('item.moneyZero')
    : item.evidenceGrade.trim().toUpperCase().startsWith('A')
      ? t('item.evidence', { grade: item.evidenceGrade })
      : item.tags?.willpower === '否'
        ? t('item.noWillpower')
        : null

  return (
    <article
      className={clsx(
        css.card,
        status === 'done' && css.cardDone,
        status === 'skipped' && css.cardSkipped,
        status === 'planned' && css.cardPlanned,
      )}
    >
      <div className={css.topRow}>
        <div className={css.badges}>
          <span className={clsx(css.tierBadge, tierBadgeClass(item.roiTier))}>
            {item.roiTier}
          </span>
          {highlightLabel && <span className={css.highlightPill}>{highlightLabel}</span>}
          <span className={css.chapterText}>{item.chapterTitle}</span>
        </div>
        <span className={css.xpText}>+{item.xp} XP</span>
      </div>

      <button
        type="button"
        className={css.bodyTrigger}
        onClick={() => onOpenDetail(item.id)}
      >
        <h3 className={clsx(css.title, status === 'done' && css.titleDone)}>{item.title}</h3>
        {item.plain && <p className={css.plain}>{item.plain}</p>}
      </button>

      {progress?.note && <div className={css.notePreview}>{progress.note}</div>}

      <div className={css.footer}>
        <div className={css.statusGroup}>
          <button
            type="button"
            className={clsx(css.checkBtn, status === 'done' && css.checkBtnDone)}
            disabled={busy}
            aria-pressed={status === 'done'}
            onClick={() => onSetStatus(item.id, status === 'done' ? 'todo' : 'done')}
          >
            <span className={css.checkCircle} aria-hidden="true">
              {status === 'done' && <IconCheck size={11} />}
            </span>
            <span>{t('item.status.done')}</span>
          </button>

          <button
            type="button"
            className={clsx(css.iconAction, status === 'planned' && css.iconActionPlanned)}
            disabled={busy}
            aria-pressed={status === 'planned'}
            aria-label={t('item.status.planned')}
            title={t('item.status.planned')}
            onClick={() => onSetStatus(item.id, status === 'planned' ? 'todo' : 'planned')}
          >
            <IconBookmark size={14} />
          </button>

          <button
            type="button"
            className={clsx(css.iconAction, status === 'skipped' && css.iconActionSkipped)}
            disabled={busy}
            aria-pressed={status === 'skipped'}
            aria-label={t('item.status.skipped')}
            title={t('item.status.skipped')}
            onClick={() => onSetStatus(item.id, status === 'skipped' ? 'todo' : 'skipped')}
          >
            <IconEyeOff size={14} />
          </button>
        </div>

        <button
          type="button"
          className={css.detailBtn}
          onClick={() => onOpenDetail(item.id)}
        >
          <span>{t('item.detail')}</span>
          <IconChevronRight size={14} />
        </button>
      </div>
    </article>
  )
}

import clsx from 'clsx'
import { Button, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { BadgeId, BadgeInfo } from '../../shared/types.ts'
import type { HowToLiveLocaleKey } from '../locales.ts'
import css from './BadgesModal.module.css'

export interface BadgesModalProps {
  readonly open: boolean
  readonly badges: readonly BadgeInfo[]
  readonly onClose: () => void
  readonly t: TranslateNS<'howtolive'>
}

const PCT_BADGES = new Set<BadgeId>(['cyber-armor', 'labor-law-dict'])

/** 10 枚成就徽章专属自定义线性 SVG 图标 */
function BadgeSvgIcon({ id }: { readonly id: BadgeId }) {
  const props = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }

  switch (id) {
    case 'first-patch':
      return (
        <svg {...props}>
          <path d="M12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.6 5.8 21 7 14 2 9.3 9 8.5z" />
        </svg>
      )
    case 'zero-cost-master':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5S13.7 12 12 12s-3 1.1-3 2.5S10.3 17 12 17s3-1.1 3-2.5" />
          <path d="M4 20 20 4" />
        </svg>
      )
    case 'clear-declutter':
      return (
        <svg {...props}>
          <path d="M3 6h18" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
      )
    case 'cyber-armor':
      return (
        <svg {...props}>
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
          <rect x="9" y="10" width="6" height="5" rx="1" />
          <path d="M10.5 10V8.5a1.5 1.5 0 0 1 3 0V10" />
        </svg>
      )
    case 'golden-four-min':
      return (
        <svg {...props}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          <path d="M4 12h4.5l1.5-3 2 6 1.5-3H20" />
        </svg>
      )
    case 'labor-law-dict':
      return (
        <svg {...props}>
          <path d="M12 3v18" />
          <path d="M5 7h14" />
          <path d="m7 7-3 6h6z" />
          <path d="m17 7-3 6h6z" />
          <path d="M8 21h8" />
        </svg>
      )
    case 'hexagon-warrior':
      return (
        <svg {...props}>
          <polygon points="12 2 20.5 7 20.5 17 12 22 3.5 17 3.5 7" />
          <polygon points="12 7 16.5 9.5 16.5 14.5 12 17 7.5 14.5 7.5 9.5" />
        </svg>
      )
    case 's-tier-hunter':
      return (
        <svg {...props}>
          <path d="M6 3h12l4 6-10 12L2 9z" />
          <path d="M2 9h20" />
          <path d="M12 21 8.5 9 12 3l3.5 6z" />
        </svg>
      )
    case 'note-keeper':
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      )
    case 'annual-inspector':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
          <path d="M16.5 3.5 20 5l-1.5 3.5" />
        </svg>
      )
  }
}

/**
 * 成就徽章墙弹窗：分「已解锁 / 探索中」实时展示 10 枚自定义线性 SVG 徽章、进度条与解锁条件。
 */
export function BadgesModal({ open, badges, onClose, t }: BadgesModalProps) {
  if (!open) return null

  const unlocked = badges.filter((b) => b.unlocked)
  const locked = badges.filter((b) => !b.unlocked)
  const totalPct = badges.length > 0 ? Math.round((unlocked.length / badges.length) * 100) : 0

  const renderBadgeCard = (badge: BadgeInfo) => {
    const nameKey = `badge.${badge.id}.name` as HowToLiveLocaleKey
    const descKey = `badge.${badge.id}.desc` as HowToLiveLocaleKey
    const progressText = PCT_BADGES.has(badge.id)
      ? t('badges.progressPct', { current: badge.current, target: badge.target })
      : t('badges.progress', { current: badge.current, target: badge.target })

    return (
      <article
        key={badge.id}
        className={clsx(css.badgeCard, badge.unlocked ? css.badgeUnlocked : css.badgeLocked)}
      >
        <div className={clsx(css.iconWrap, badge.unlocked && css.iconWrapUnlocked)}>
          <BadgeSvgIcon id={badge.id} />
        </div>
        <div className={css.badgeBody}>
          <div className={css.badgeTop}>
            <h4 className={css.badgeName}>{t(nameKey)}</h4>
            {badge.unlocked ? (
              <Tag tone="success">{t('badges.unlockedTag')}</Tag>
            ) : (
              <span className={css.progressText}>{progressText}</span>
            )}
          </div>
          <p className={css.badgeDesc}>{t(descKey)}</p>
          <div
            className={css.progressTrack}
            role="progressbar"
            aria-valuenow={badge.progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t(nameKey)}
          >
            <div
              className={clsx(css.progressFill, badge.unlocked && css.progressFillDone)}
              style={{ width: `${badge.progressPct}%` }}
            />
          </div>
        </div>
      </article>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('badges.title')}
      description={t('badges.desc')}
      closeLabel={t('drawer.close')}
      className={css.modal}
      contentClassName={css.content}
      footer={
        <div className={css.footer}>
          <Button variant="primary" size="sm" onClick={onClose}>
            {t('drawer.close')}
          </Button>
        </div>
      }
    >
      <div className={css.summaryBox}>
        <div className={css.summaryRow}>
          <span className={css.summaryText}>
            {t('badges.summary', { unlocked: unlocked.length, total: badges.length })}
          </span>
          <span className={css.summaryPct}>{totalPct}%</span>
        </div>
        <div className={css.summaryTrack}>
          <div className={css.summaryFill} style={{ width: `${totalPct}%` }} />
        </div>
      </div>

      <section className={css.section}>
        <h3 className={css.sectionTitle}>
          {t('badges.unlockedSection', { count: unlocked.length })}
        </h3>
        {unlocked.length === 0 ? (
          <div className={css.emptyTip}>{t('badges.emptyUnlocked')}</div>
        ) : (
          <div className={css.grid}>{unlocked.map(renderBadgeCard)}</div>
        )}
      </section>

      <section className={css.section}>
        <h3 className={css.sectionTitle}>
          {t('badges.lockedSection', { count: locked.length })}
        </h3>
        {locked.length === 0 ? (
          <div className={css.emptyTip}>{t('badges.allUnlocked')}</div>
        ) : (
          <div className={css.grid}>{locked.map(renderBadgeCard)}</div>
        )}
      </section>
    </Modal>
  )
}

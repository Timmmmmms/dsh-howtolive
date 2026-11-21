import { useEffect, useRef, useState } from 'react'
import { Button, IconCheckOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ItemStatus } from '../../shared/types.ts'
import { selectHowToLivePatches } from '../howtolive-turn.ts'
import type { HowToLiveViewSnapshot } from '../store.ts'
import css from './TurnPatchCard.module.css'

const INITIAL_VISIBLE_COUNT = 3

export interface TurnPatchCardInjected {
  readonly hooks: {
    readonly howtolive: HostObservable<HowToLiveViewSnapshot>
  }
  readonly ensureLoaded: () => Promise<void>
  readonly refresh: () => Promise<void>
  readonly refreshState?: () => Promise<void>
  readonly setItemProgress: (id: string, patch: { status?: ItemStatus }) => Promise<unknown>
  readonly openInPanel: (id?: string) => void
}

export type TurnPatchCardProps = PropsRuntime<'conversation.chat.turnTail'>
  & InjectFace<TurnPatchCardInjected>
  & PropsLocale<'howtolive'>

/**
 * 挂载在 conversation.chat.turnTail 的聊天内嵌补丁卡片：
 * 当本轮 Agent 调用过 howtolive_search / howtolive_get_item 时，在回复下方呈现可直接打勾与加清单的原生卡片。
 * 默认展示前 3 条，超出时可展开；打卡成功提供轻量 +XP 状态反馈。
 */
export function TurnPatchCard(props: TurnPatchCardProps) {
  const matched = selectHowToLivePatches(props)
  const { useHowtolive, ensureLoaded, refresh, refreshState, setItemProgress, openInPanel, t } = props
  const progressMap = useHowtolive((s) => s.state?.progress)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [xpFlash, setXpFlash] = useState<{ id: string; xp: number } | null>(null)
  const xpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (xpTimerRef.current) clearTimeout(xpTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!matched) return
    void ensureLoaded()
    if (matched.hasUpdate) {
      void (refreshState ? refreshState() : refresh())
    }
  }, [matched !== null, matched?.hasUpdate, ensureLoaded, refresh, refreshState])

  if (!matched) return null

  const totalItems = matched.items.length
  const visibleItems = expanded ? matched.items : matched.items.slice(0, INITIAL_VISIBLE_COUNT)
  const hiddenCount = Math.max(0, totalItems - INITIAL_VISIBLE_COUNT)

  const handleToggle = async (id: string, target: ItemStatus, current: ItemStatus, itemXp: number) => {
    setBusyId(id)
    const nextStatus: ItemStatus = current === target ? 'todo' : target
    try {
      await setItemProgress(id, { status: nextStatus })
      if (nextStatus === 'done' && current !== 'done') {
        setXpFlash({ id, xp: itemXp })
        if (xpTimerRef.current) clearTimeout(xpTimerRef.current)
        xpTimerRef.current = setTimeout(() => {
          setXpFlash(null)
          xpTimerRef.current = null
        }, 2400)
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={css.card}>
      <div className={css.header}>
        <div className={css.headerLeft}>
          <span className={css.badge}>{t('turn.badge')}</span>
          {xpFlash && (
            <span className={css.xpPill} role="status">
              {t('turn.xpFeedback', { xp: xpFlash.xp })}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => openInPanel()}>
          {t('turn.openPanel')}
        </Button>
      </div>

      <div className={css.list}>
        {visibleItems.map((item) => {
          const liveStatus: ItemStatus = progressMap?.[item.id]?.status ?? item.userStatus
          const isBusy = busyId === item.id

          return (
            <div key={item.id} className={css.row}>
              <div className={css.rowMain}>
                <div className={css.rowMeta}>
                  <span className={css.itemId}>{item.id}</span>
                  <Tag tone={item.roiTier === 'S' ? 'warning' : item.roiTier === 'A' ? 'info' : 'neutral'}>
                    {t('item.tier', { tier: item.roiTier })}
                  </Tag>
                  <Tag tone={item.evidenceGrade.startsWith('A') ? 'success' : 'neutral'}>
                    {t('item.evidence', { grade: item.evidenceGrade })}
                  </Tag>
                  <span className={css.itemTitle}>{item.title}</span>
                </div>
                {item.plain && <span className={css.itemPlain}>{item.plain}</span>}
              </div>

              <div className={css.rowActions}>
                <Button
                  variant={liveStatus === 'done' ? 'primary' : 'outline'}
                  size="sm"
                  disabled={isBusy}
                  icon={liveStatus === 'done' ? <IconCheckOutlineRegular size={14} /> : undefined}
                  onClick={() => void handleToggle(item.id, 'done', liveStatus, item.xp)}
                >
                  {liveStatus === 'done' ? t('turn.markedDone') : `${t('turn.markDone')} +${item.xp}`}
                </Button>
                <Button
                  variant={liveStatus === 'planned' ? 'primary' : 'ghost'}
                  size="sm"
                  disabled={isBusy}
                  onClick={() => void handleToggle(item.id, 'planned', liveStatus, item.xp)}
                >
                  {liveStatus === 'planned' ? t('turn.markedPlanned') : t('turn.markPlanned')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openInPanel(item.id)}>
                  {t('item.detail')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {hiddenCount > 0 && (
        <div className={css.expandRow}>
          <button
            type="button"
            className={css.expandBtn}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? t('turn.collapse') : t('turn.expandMore', { count: hiddenCount })}
          </button>
        </div>
      )}
    </div>
  )
}

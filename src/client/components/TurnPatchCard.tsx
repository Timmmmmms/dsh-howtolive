import { useEffect, useState } from 'react'
import { Button, IconCheckOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ItemStatus } from '../../shared/types.ts'
import { selectHowToLivePatches } from '../howtolive-turn.ts'
import type { HowToLiveViewSnapshot } from '../store.ts'
import css from './TurnPatchCard.module.css'

export interface TurnPatchCardInjected {
  readonly hooks: {
    readonly howtolive: HostObservable<HowToLiveViewSnapshot>
  }
  readonly ensureLoaded: () => Promise<void>
  readonly refresh: () => Promise<void>
  readonly setItemProgress: (id: string, patch: { status?: ItemStatus }) => Promise<unknown>
  readonly openInPanel: (id?: string) => void
}

export type TurnPatchCardProps = PropsRuntime<'conversation.chat.turnTail'>
  & InjectFace<TurnPatchCardInjected>
  & PropsLocale<'howtolive'>

/**
 * 挂载在 conversation.chat.turnTail 的聊天内嵌补丁卡片：
 * 当本轮 Agent 调用过 howtolive_search / howtolive_get_item 时，在回复下方呈现可直接打勾与加清单的原生卡片。
 */
export function TurnPatchCard(props: TurnPatchCardProps) {
  const matched = selectHowToLivePatches(props)
  const { useHowtolive, ensureLoaded, refresh, setItemProgress, openInPanel, t } = props
  const progressMap = useHowtolive((s) => s.state?.progress)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!matched) return
    void ensureLoaded()
    if (matched.hasUpdate) {
      void refresh()
    }
  }, [matched !== null, matched?.hasUpdate, ensureLoaded, refresh])

  if (!matched) return null

  const handleToggle = async (id: string, target: ItemStatus, current: ItemStatus) => {
    setBusyId(id)
    try {
      await setItemProgress(id, { status: current === target ? 'todo' : target })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={css.card}>
      <div className={css.header}>
        <span className={css.badge}>{t('turn.badge')}</span>
        <Button variant="ghost" size="sm" onClick={() => openInPanel()}>
          {t('turn.openPanel')}
        </Button>
      </div>

      <div className={css.list}>
        {matched.items.map((item) => {
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
                  onClick={() => void handleToggle(item.id, 'done', liveStatus)}
                >
                  {liveStatus === 'done' ? t('turn.markedDone') : `${t('turn.markDone')} +${item.xp}`}
                </Button>
                <Button
                  variant={liveStatus === 'planned' ? 'primary' : 'ghost'}
                  size="sm"
                  disabled={isBusy}
                  onClick={() => void handleToggle(item.id, 'planned', liveStatus)}
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
    </div>
  )
}

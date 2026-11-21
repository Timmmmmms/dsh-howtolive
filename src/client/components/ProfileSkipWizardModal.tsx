import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProfileSkipAnalysis, ProfileSkipReasonId } from '../../shared/profile-filter.ts'
import type { HowToLiveLocaleKey } from '../locales.ts'
import css from './ProfileSkipWizardModal.module.css'

export interface ProfileSkipWizardModalProps {
  readonly open: boolean
  readonly analysis: ProfileSkipAnalysis
  readonly onClose: () => void
  readonly onConfirmSkip: (itemIds: string[]) => Promise<void>
  readonly t: TranslateNS<'howtolive'>
}

const REASON_LABEL_KEY: Record<ProfileSkipReasonId, HowToLiveLocaleKey> = {
  notPregnant: 'skipWizard.reason.notPregnant',
  noInfant: 'skipWizard.reason.noInfant',
  noChild: 'skipWizard.reason.noChild',
  noElderly: 'skipWizard.reason.noElderly',
  notDeveloper: 'skipWizard.reason.notDeveloper',
  notBusiness: 'skipWizard.reason.notBusiness',
  notRenting: 'skipWizard.reason.notRenting',
  notStudent: 'skipWizard.reason.notStudent',
}

/**
 * 「画像智能筛查不适用」确认向导弹窗：
 * - 按不适用原因分组展示候选条目，默认全选但必须由用户明确勾选确认后才批量标记 `skipped`
 * - 绝不静默修改任何用户进度
 */
export function ProfileSkipWizardModal({
  open,
  analysis,
  onClose,
  onConfirmSkip,
  t,
}: ProfileSkipWizardModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)

  const allCandidateIds = useMemo(
    () => analysis.candidates.map((c) => c.item.id),
    [analysis.candidates],
  )

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(allCandidateIds))
    }
  }, [open, allCandidateIds])

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setGroupSelection = (ids: readonly string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const handleConfirm = async () => {
    if (busy || selectedIds.size === 0) return
    setBusy(true)
    try {
      await onConfirmSkip(Array.from(selectedIds))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const selectedCount = selectedIds.size

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('skipWizard.title')}
      description={t('skipWizard.desc')}
      closeLabel={t('skipWizard.cancel')}
      className={css.modal}
      contentClassName={css.content}
      footer={
        <div className={css.footer}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t('skipWizard.cancel')}
          </Button>
          {analysis.totalCount > 0 && (
            <Button
              variant="primary"
              size="sm"
              disabled={busy || selectedCount === 0}
              onClick={() => void handleConfirm()}
            >
              {busy
                ? t('skipWizard.confirming')
                : t('skipWizard.confirm', { count: selectedCount })}
            </Button>
          )}
        </div>
      }
    >
      {analysis.totalCount === 0 ? (
        <div className={css.emptyWrap}>
          <p className={css.emptyTitle}>{t('skipWizard.emptyTitle')}</p>
          <p className={css.emptyDesc}>{t('skipWizard.emptyDesc')}</p>
        </div>
      ) : (
        <>
          <div className={css.topBar}>
            <span className={css.selectedCount}>
              {t('skipWizard.selectedCount', {
                selected: selectedCount,
                total: analysis.totalCount,
              })}
            </span>
            <div className={css.bulkActions}>
              <button
                type="button"
                className={css.linkBtn}
                onClick={() => setSelectedIds(new Set(allCandidateIds))}
              >
                {t('skipWizard.selectAll')}
              </button>
              <button
                type="button"
                className={css.linkBtn}
                onClick={() => setSelectedIds(new Set())}
              >
                {t('skipWizard.clearAll')}
              </button>
            </div>
          </div>

          {analysis.groups.map((group) => {
            const groupIds = group.items.map((i) => i.id)
            const groupSelectedCount = groupIds.filter((id) => selectedIds.has(id)).length
            const allInGroupSelected = groupSelectedCount === groupIds.length

            return (
              <div key={group.reasonId} className={css.groupCard}>
                <div className={css.groupHead}>
                  <div className={css.groupTitleWrap}>
                    <h3 className={css.groupTitle}>{t(REASON_LABEL_KEY[group.reasonId])}</h3>
                    <span className={css.groupBadge}>
                      {groupSelectedCount}/{group.items.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={css.linkBtn}
                    onClick={() => setGroupSelection(groupIds, !allInGroupSelected)}
                  >
                    {allInGroupSelected
                      ? t('skipWizard.groupClear')
                      : t('skipWizard.groupSelectAll')}
                  </button>
                </div>

                <div className={css.itemList}>
                  {group.items.map((item) => {
                    const checked = selectedIds.has(item.id)
                    return (
                      <label key={item.id} className={css.itemRow}>
                        <input
                          type="checkbox"
                          className={css.checkbox}
                          checked={checked}
                          onChange={() => toggleItem(item.id)}
                        />
                        <div className={css.itemBody}>
                          <div className={css.itemTitleRow}>
                            <span className={css.itemId}>#{item.id}</span>
                            <Tag>{t('item.tier', { tier: item.roiTier })}</Tag>
                            <span className={css.itemTitle}>{item.title}</span>
                          </div>
                          <span className={css.itemPlain}>{item.plain}</span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )}
    </Modal>
  )
}

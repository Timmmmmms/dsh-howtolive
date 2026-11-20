import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Modal, Pill, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ItemProgress, ItemStatus, KnowledgeItem, KnowledgeItemSummary } from '../../shared/types.ts'
import css from './ItemDetailDrawer.module.css'

export interface ItemDetailDrawerProps {
  readonly open: boolean
  readonly loading: boolean
  readonly summaryItem: KnowledgeItemSummary | null
  readonly detail: { readonly item: KnowledgeItem; readonly crossRefs: readonly KnowledgeItemSummary[] } | null
  readonly progress?: ItemProgress | undefined
  readonly onClose: () => void
  readonly onJumpToItem: (id: string) => void
  readonly onUpdateProgress: (id: string, patch: { status?: ItemStatus; note?: string }) => Promise<void>
  readonly t: TranslateNS<'howtolive'>
}

const HTTP_URL_REGEX = /<?(https?:\/\/[^\s<>）)」』\]]+)>?/g

/** 将来源文本中的 http(s) URL 转换为安全可点击链接 */
function renderTextWithLinks(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(HTTP_URL_REGEX)) {
    const raw = match[0]
    const url = match[1]
    const start = match.index ?? 0
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start))
    }
    if (url) {
      nodes.push(
        <a
          key={`link-${key++}`}
          href={url}
          className={css.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          {url}
        </a>,
      )
    } else {
      nodes.push(raw)
    }
    lastIndex = start + raw.length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

/**
 * 条目完整循证详情弹窗：展示成本、说人话、收益/风险、来源出处链接、交叉引用跳转与私有笔记编辑。
 */
export function ItemDetailDrawer({
  open,
  loading,
  summaryItem,
  detail,
  progress,
  onClose,
  onJumpToItem,
  onUpdateProgress,
  t,
}: ItemDetailDrawerProps) {
  const item = detail?.item ?? summaryItem
  const currentNote = progress?.note ?? ''
  const [noteDraft, setNoteDraft] = useState(currentNote)
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  useEffect(() => {
    setNoteDraft(currentNote)
    setNoteSaved(false)
  }, [item?.id, currentNote])

  const status: ItemStatus = progress?.status ?? 'todo'
  const sourcesNodes = useMemo(
    () => (detail?.item.sources ? renderTextWithLinks(detail.item.sources) : null),
    [detail?.item.sources],
  )
  const notesNodes = useMemo(
    () => (detail?.item.notes ? renderTextWithLinks(detail.item.notes) : null),
    [detail?.item.notes],
  )

  if (!open || !item) return null

  const handleSaveNote = async () => {
    setSavingNote(true)
    try {
      await onUpdateProgress(item.id, { note: noteDraft })
      setNoteSaved(true)
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${item.id} · ${item.title}`}
      description={`${item.chapterTitle}${item.topic ? ` · ${item.topic}` : ''}`}
      closeLabel={t('drawer.close')}
      className={css.modal}
      contentClassName={css.content}
      footer={
        <div className={css.footerRow}>
          <div className={css.footerLeft}>
            <Button
              variant={status === 'done' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => void onUpdateProgress(item.id, { status: status === 'done' ? 'todo' : 'done' })}
            >
              {t('item.status.done')} (+{item.xp} XP)
            </Button>
            <Button
              variant={status === 'planned' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => void onUpdateProgress(item.id, { status: status === 'planned' ? 'todo' : 'planned' })}
            >
              {t('item.status.planned')}
            </Button>
            <Button
              variant={status === 'skipped' ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => void onUpdateProgress(item.id, { status: status === 'skipped' ? 'todo' : 'skipped' })}
            >
              {t('item.status.skipped')}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('drawer.close')}
          </Button>
        </div>
      }
    >
      <div className={css.badges}>
        <span className={css.itemId}>{item.id}</span>
        <Tag tone={item.roiTier === 'S' ? 'warning' : item.roiTier === 'A' ? 'info' : 'neutral'}>
          {t('item.tier', { tier: item.roiTier })}
        </Tag>
        {item.evidenceGrade && (
          <Tag tone={item.evidenceGrade.startsWith('A') ? 'success' : 'neutral'}>
            {t('item.evidence', { grade: item.evidenceGrade })}
          </Tag>
        )}
        {item.tags?.money === '0' && <Tag tone="success">{t('item.moneyZero')}</Tag>}
        {item.tags?.willpower === '否' && <Tag tone="neutral">{t('item.noWillpower')}</Tag>}
        {item.tags?.audience.map((aud) => (
          <Tag key={aud} tone="outline">{aud}</Tag>
        ))}
      </div>

      {item.plain && (
        <div className={css.section}>
          <span className={css.sectionLabel}>{t('drawer.plain')}</span>
          <div className={css.sectionBody}>{item.plain}</div>
        </div>
      )}

      {item.cost && (
        <div className={css.section}>
          <span className={css.sectionLabel}>{t('drawer.cost')}</span>
          <div className={css.sectionBody}>{item.cost}</div>
        </div>
      )}

      {loading && !detail ? (
        <div className={css.loading}>{t('drawer.loading')}</div>
      ) : (
        <>
          {detail?.item.benefit && (
            <div className={css.section}>
              <span className={css.sectionLabel}>{t('drawer.benefit')}</span>
              <div className={css.sectionBody}>{detail.item.benefit}</div>
            </div>
          )}

          {notesNodes && (
            <div className={css.section}>
              <span className={css.sectionLabel}>{t('drawer.notes')}</span>
              <div className={css.sectionBody}>{notesNodes}</div>
            </div>
          )}

          {sourcesNodes && (
            <div className={css.section}>
              <span className={css.sectionLabel}>{t('drawer.sources')}</span>
              <div className={css.sectionBody}>{sourcesNodes}</div>
            </div>
          )}

          {detail && detail.crossRefs.length > 0 && (
            <div className={css.section}>
              <span className={css.sectionLabel}>{t('drawer.crossRefs')}</span>
              <div className={css.refsGrid}>
                {detail.crossRefs.map((ref) => (
                  <Pill key={ref.id} onClick={() => onJumpToItem(ref.id)}>
                    {ref.id} · {ref.title}
                  </Pill>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className={css.section}>
        <span className={css.sectionLabel}>{t('drawer.myNote')}</span>
        <div className={css.noteEditor}>
          <textarea
            className={css.textarea}
            value={noteDraft}
            placeholder={t('drawer.notePlaceholder')}
            onChange={(e) => {
              setNoteDraft(e.target.value)
              setNoteSaved(false)
            }}
          />
          <div className={css.noteBar}>
            <span className={css.savedTip}>{noteSaved ? t('drawer.noteSaved') : ''}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={savingNote || noteDraft === currentNote}
              onClick={() => void handleSaveNote()}
            >
              {t('drawer.saveNote')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

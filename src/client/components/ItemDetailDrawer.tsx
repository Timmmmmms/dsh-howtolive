import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Modal, Pill, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ItemProgress, ItemStatus, KnowledgeItem, KnowledgeItemSummary } from '../../shared/types.ts'
import { IconArrowLeft, IconSparkles } from './Icons.tsx'
import css from './ItemDetailDrawer.module.css'

export interface ItemDetailDrawerProps {
  readonly open: boolean
  readonly loading: boolean
  readonly summaryItem: KnowledgeItemSummary | null
  readonly detail: { readonly item: KnowledgeItem; readonly crossRefs: readonly KnowledgeItemSummary[] } | null
  readonly progress?: ItemProgress | undefined
  readonly canGoBack?: boolean
  readonly onGoBack?: () => void
  readonly onClose: () => void
  readonly onJumpToItem: (id: string) => void
  readonly onAskAi?: (item: KnowledgeItem | KnowledgeItemSummary) => void
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
  canGoBack = false,
  onGoBack,
  onClose,
  onJumpToItem,
  onAskAi,
  onUpdateProgress,
  t,
}: ItemDetailDrawerProps) {
  const item = detail?.item ?? summaryItem
  const currentNote = progress?.note ?? ''
  const [noteDraft, setNoteDraft] = useState(currentNote)
  const [savingNote, setSavingNote] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'autoSaved'>('idle')
  const savingRef = useRef(false)

  useEffect(() => {
    setNoteDraft(currentNote)
    setSaveState('idle')
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

  const saveNoteIfDirty = async (mode: 'manual' | 'auto'): Promise<void> => {
    if (savingRef.current) return
    if (noteDraft === currentNote) return
    savingRef.current = true
    setSavingNote(true)
    try {
      await onUpdateProgress(item.id, { note: noteDraft })
      setSaveState(mode === 'auto' ? 'autoSaved' : 'saved')
    } catch {
      // 错误由上层统一 Toast 提示，保留草稿便于重试
    } finally {
      savingRef.current = false
      setSavingNote(false)
    }
  }

  const handleClose = () => {
    void saveNoteIfDirty('auto')
    onClose()
  }

  const handleJump = (targetId: string) => {
    void saveNoteIfDirty('auto')
    onJumpToItem(targetId)
  }

  const handleGoBack = () => {
    void saveNoteIfDirty('auto')
    onGoBack?.()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
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
          <div className={css.footerRight}>
            {onAskAi && (
              <Button
                variant="outline"
                size="sm"
                icon={<IconSparkles size={14} />}
                onClick={() => {
                  void saveNoteIfDirty('auto')
                  onAskAi(detail?.item ?? item)
                }}
              >
                {t('drawer.askAi')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleClose}>
              {t('drawer.close')}
            </Button>
          </div>
        </div>
      }
    >
      {canGoBack && onGoBack && (
        <div className={css.backRow}>
          <button type="button" className={css.backBtn} onClick={handleGoBack}>
            <IconArrowLeft size={14} />
            <span>{t('drawer.back')}</span>
          </button>
        </div>
      )}

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
                  <Pill key={ref.id} onClick={() => handleJump(ref.id)}>
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
              setSaveState('idle')
            }}
            onBlur={() => {
              void saveNoteIfDirty('auto')
            }}
          />
          <div className={css.noteBar}>
            <span className={css.savedTip}>
              {savingNote
                ? t('drawer.noteSaving')
                : saveState === 'autoSaved'
                  ? t('drawer.noteAutoSaved')
                  : saveState === 'saved'
                    ? t('drawer.noteSaved')
                    : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={savingNote || noteDraft === currentNote}
              onClick={() => void saveNoteIfDirty('manual')}
            >
              {t('drawer.saveNote')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

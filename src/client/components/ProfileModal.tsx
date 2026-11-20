import { useEffect, useState } from 'react'
import { Button, Modal, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { UserProfile } from '../../shared/types.ts'
import css from './ProfileModal.module.css'

export interface ProfileModalProps {
  readonly open: boolean
  readonly profile: UserProfile
  readonly onClose: () => void
  readonly onSave: (profile: UserProfile) => Promise<void>
  readonly onSaveAndCheckup: (profile: UserProfile) => Promise<void>
  readonly t: TranslateNS<'howtolive'>
}

const AGE_OPTIONS: ReadonlyArray<{ value: NonNullable<UserProfile['ageGroup']>; label: string }> = [
  { value: '18-25', label: '18-25 岁' },
  { value: '26-35', label: '26-35 岁' },
  { value: '36-45', label: '36-45 岁' },
  { value: '46-60', label: '46-60 岁' },
  { value: '60+', label: '60 岁以上' },
]

const OCCUPATION_OPTIONS: ReadonlyArray<{ value: NonNullable<UserProfile['occupation']>; label: string }> = [
  { value: 'programmer', label: '程序员 / 技术' },
  { value: 'office', label: '上班族' },
  { value: 'freelance', label: '自由职业 / 独立开发' },
  { value: 'business', label: '创业 / 个体' },
  { value: 'student', label: '学生' },
  { value: 'other', label: '其他' },
]

const HOUSING_OPTIONS: ReadonlyArray<{ value: NonNullable<UserProfile['housing']>; label: string }> = [
  { value: 'renting', label: '租房' },
  { value: 'buying', label: '准备买房 / 供房' },
  { value: 'owned', label: '自有住房' },
  { value: 'family', label: '与家人同住' },
]

const FAMILY_OPTIONS: ReadonlyArray<{ value: NonNullable<UserProfile['family']>[number]; label: string }> = [
  { value: 'single', label: '单身' },
  { value: 'partner', label: '伴侣 / 已婚' },
  { value: 'pregnant', label: '备孕 / 孕期' },
  { value: 'infant', label: '婴幼儿' },
  { value: 'child', label: '学龄孩子' },
  { value: 'elderly', label: '照顾老人' },
]

const GOAL_OPTIONS: ReadonlyArray<{ value: NonNullable<UserProfile['goals']>[number]; label: string }> = [
  { value: 'health', label: '生命防线与健康' },
  { value: 'money', label: '省钱攒钱与防坑' },
  { value: 'legal', label: '法律合规与维权' },
  { value: 'career', label: '职场效率与路径' },
  { value: 'family', label: '婚育亲子与养老' },
  { value: 'security', label: '信息安全与心态' },
]

function toggleArrayItem<T extends string>(list: readonly T[] | undefined, value: T): T[] {
  const current = list ?? []
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
}

/**
 * 10 秒本地个人画像设置弹窗：纯本地存储，驱动每日推荐与 AI 人生体检上下文。
 */
export function ProfileModal({
  open,
  profile,
  onClose,
  onSave,
  onSaveAndCheckup,
  t,
}: ProfileModalProps) {
  const [draft, setDraft] = useState<UserProfile>(profile)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(profile)
    }
  }, [open, profile])

  const submitSave = async (runCheckup: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      if (runCheckup) {
        await onSaveAndCheckup(draft)
      } else {
        await onSave(draft)
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('profile.title')}
      description={t('profile.desc')}
      closeLabel={t('profile.cancel')}
      className={css.modal}
      contentClassName={css.content}
      footer={
        <div className={css.footer}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t('profile.cancel')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void submitSave(false)} disabled={busy}>
            {t('profile.save')}
          </Button>
          <Button variant="primary" size="sm" onClick={() => void submitSave(true)} disabled={busy}>
            {t('profile.saveAndCheckup')}
          </Button>
        </div>
      }
    >
      <div className={css.fieldGroup}>
        <span className={css.fieldLabel}>{t('profile.age')}</span>
        <div className={css.pillGroup}>
          {AGE_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              active={draft.ageGroup === opt.value}
              onClick={() =>
                setDraft((prev) => {
                  const next = { ...prev }
                  if (prev.ageGroup === opt.value) delete next.ageGroup
                  else next.ageGroup = opt.value
                  return next
                })
              }
            >
              {opt.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className={css.fieldGroup}>
        <span className={css.fieldLabel}>{t('profile.occupation')}</span>
        <div className={css.pillGroup}>
          {OCCUPATION_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              active={draft.occupation === opt.value}
              onClick={() =>
                setDraft((prev) => {
                  const next = { ...prev }
                  if (prev.occupation === opt.value) delete next.occupation
                  else next.occupation = opt.value
                  return next
                })
              }
            >
              {opt.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className={css.fieldGroup}>
        <span className={css.fieldLabel}>{t('profile.housing')}</span>
        <div className={css.pillGroup}>
          {HOUSING_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              active={draft.housing === opt.value}
              onClick={() =>
                setDraft((prev) => {
                  const next = { ...prev }
                  if (prev.housing === opt.value) delete next.housing
                  else next.housing = opt.value
                  return next
                })
              }
            >
              {opt.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className={css.fieldGroup}>
        <span className={css.fieldLabel}>{t('profile.family')}</span>
        <div className={css.pillGroup}>
          {FAMILY_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              active={(draft.family ?? []).includes(opt.value)}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  family: toggleArrayItem(prev.family, opt.value),
                }))
              }
            >
              {opt.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className={css.fieldGroup}>
        <span className={css.fieldLabel}>{t('profile.goals')}</span>
        <div className={css.pillGroup}>
          {GOAL_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              active={(draft.goals ?? []).includes(opt.value)}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  goals: toggleArrayItem(prev.goals, opt.value),
                }))
              }
            >
              {opt.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className={css.fieldGroup}>
        <span className={css.fieldLabel}>{t('profile.customNote')}</span>
        <textarea
          className={css.textarea}
          data-modal-autofocus
          value={draft.customNote ?? ''}
          placeholder={t('profile.customNotePlaceholder')}
          onChange={(e) => setDraft((prev) => ({ ...prev, customNote: e.target.value }))}
        />
      </div>
    </Modal>
  )
}

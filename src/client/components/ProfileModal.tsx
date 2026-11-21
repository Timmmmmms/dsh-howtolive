import { useEffect, useState } from 'react'
import { Button, Modal, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { UserProfile } from '../../shared/types.ts'
import type { HowToLiveLocaleKey } from '../locales.ts'
import css from './ProfileModal.module.css'

export interface ProfileModalProps {
  readonly open: boolean
  readonly profile: UserProfile
  readonly onClose: () => void
  readonly onSave: (profile: UserProfile) => Promise<void>
  readonly onSaveAndCheckup: (profile: UserProfile) => Promise<void>
  /** 首次体检引导模式下提供「跳过画像直接体检」入口 */
  readonly onSkipToCheckup?: () => void
  readonly t: TranslateNS<'howtolive'>
}

const AGE_OPTIONS: ReadonlyArray<{ value: NonNullable<UserProfile['ageGroup']>; labelKey: HowToLiveLocaleKey }> = [
  { value: '18-25', labelKey: 'profile.age.18-25' },
  { value: '26-35', labelKey: 'profile.age.26-35' },
  { value: '36-45', labelKey: 'profile.age.36-45' },
  { value: '46-60', labelKey: 'profile.age.46-60' },
  { value: '60+', labelKey: 'profile.age.60+' },
]

const OCCUPATION_OPTIONS: ReadonlyArray<{ value: NonNullable<UserProfile['occupation']>; labelKey: HowToLiveLocaleKey }> = [
  { value: 'programmer', labelKey: 'profile.occupation.programmer' },
  { value: 'office', labelKey: 'profile.occupation.office' },
  { value: 'freelance', labelKey: 'profile.occupation.freelance' },
  { value: 'business', labelKey: 'profile.occupation.business' },
  { value: 'student', labelKey: 'profile.occupation.student' },
  { value: 'other', labelKey: 'profile.occupation.other' },
]

const HOUSING_OPTIONS: ReadonlyArray<{ value: NonNullable<UserProfile['housing']>; labelKey: HowToLiveLocaleKey }> = [
  { value: 'renting', labelKey: 'profile.housing.renting' },
  { value: 'buying', labelKey: 'profile.housing.buying' },
  { value: 'owned', labelKey: 'profile.housing.owned' },
  { value: 'family', labelKey: 'profile.housing.family' },
]

const FAMILY_OPTIONS: ReadonlyArray<{ value: NonNullable<UserProfile['family']>[number]; labelKey: HowToLiveLocaleKey }> = [
  { value: 'single', labelKey: 'profile.family.single' },
  { value: 'partner', labelKey: 'profile.family.partner' },
  { value: 'pregnant', labelKey: 'profile.family.pregnant' },
  { value: 'infant', labelKey: 'profile.family.infant' },
  { value: 'child', labelKey: 'profile.family.child' },
  { value: 'elderly', labelKey: 'profile.family.elderly' },
]

const GOAL_OPTIONS: ReadonlyArray<{ value: NonNullable<UserProfile['goals']>[number]; labelKey: HowToLiveLocaleKey }> = [
  { value: 'health', labelKey: 'profile.goals.health' },
  { value: 'money', labelKey: 'profile.goals.money' },
  { value: 'legal', labelKey: 'profile.goals.legal' },
  { value: 'career', labelKey: 'profile.goals.career' },
  { value: 'family', labelKey: 'profile.goals.family' },
  { value: 'security', labelKey: 'profile.goals.security' },
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
  onSkipToCheckup,
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
          {onSkipToCheckup && (
            <Button variant="ghost" size="sm" onClick={onSkipToCheckup} disabled={busy}>
              {t('profile.skipToCheckup')}
            </Button>
          )}
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
              {t(opt.labelKey)}
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
              {t(opt.labelKey)}
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
              {t(opt.labelKey)}
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
              {t(opt.labelKey)}
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
              {t(opt.labelKey)}
            </Pill>
          ))}
        </div>
      </div>

      <div className={css.fieldGroup}>
        <span className={css.fieldLabel}>{t('profile.customNote')}</span>
        <textarea
          className={css.textarea}
          value={draft.customNote ?? ''}
          placeholder={t('profile.customNotePlaceholder')}
          onChange={(e) => setDraft((prev) => ({ ...prev, customNote: e.target.value }))}
        />
      </div>
    </Modal>
  )
}

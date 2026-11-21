import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  buildLifeOsCardSvg,
  computeLifeOsProfile,
  resolveLifeOsArchetypeKey,
} from '../../shared/life-os.ts'
import type {
  ItemProgress,
  KnowledgeItemSummary,
  ScoreSummary,
  UserProfile,
} from '../../shared/types.ts'
import type { HowToLiveLocaleKey } from '../locales.ts'
import { IconDownload, IconImage, IconShieldCheck } from './Icons.tsx'
import css from './ShareCardModal.module.css'

export interface ShareCardModalProps {
  readonly open: boolean
  readonly summary: ScoreSummary | null
  readonly items: readonly KnowledgeItemSummary[]
  readonly progress: Readonly<Record<string, ItemProgress | undefined>>
  readonly profile?: UserProfile
  readonly onClose: () => void
  readonly onNotify?: (message: string, tone?: 'success' | 'info' | 'error') => void
  readonly t: TranslateNS<'howtolive'>
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 将自包含 SVG 字符串通过离屏 Canvas 2x 渲染为高清 PNG Blob */
async function renderSvgToPngBlob(svgMarkup: string, width = 840, height = 520, scale = 2): Promise<Blob> {
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('SVG image load failed'))
      image.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, width, height)

    const pngBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1)
    })
    if (!pngBlob) throw new Error('Canvas toBlob returned null')
    return pngBlob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 可分享「人生 OS 架构师名片」弹窗：
 * - 严格脱敏，仅展示版本号、流派称号、六维雷达、覆盖率、等级 XP、安全评级与代表徽章
 * - 支持暗黑极客风 / 杂志亮白风切换，以及下载 SVG 与离屏 Canvas 2x 高清 PNG 导出
 */
export function ShareCardModal({
  open,
  summary,
  items,
  progress,
  profile,
  onClose,
  onNotify,
  t,
}: ShareCardModalProps) {
  const [theme, setTheme] = useState<'dark' | 'editorial'>('dark')
  const [exportingPng, setExportingPng] = useState(false)

  const osProfile = useMemo(() => {
    if (!summary) return null
    return computeLifeOsProfile(summary, items, progress, profile)
  }, [summary, items, progress, profile])

  const svgMarkup = useMemo(() => {
    if (!summary || !osProfile) return ''
    const archetypeKey = resolveLifeOsArchetypeKey(summary)
    const badgeNames: Record<string, string> = {}
    for (const badge of osProfile.featuredBadges) {
      badgeNames[badge.id] = t(`badge.${badge.id}.name` as HowToLiveLocaleKey)
    }

    return buildLifeOsCardSvg(osProfile, {
      theme,
      archetypeTitle: t(`share.archetype.${archetypeKey}.name` as HowToLiveLocaleKey),
      archetypeTagline: t(`share.archetype.${archetypeKey}.tagline` as HowToLiveLocaleKey),
      securityLabel: t(`cve.status.${osProfile.securityStatus}` as HowToLiveLocaleKey),
      coverageLabel: t('share.card.coverage'),
      levelLabel: `${t('radar.level', { level: osProfile.level.level, title: osProfile.level.title })} · ${osProfile.level.totalXp} XP`,
      badgesTitle: t('share.card.badges'),
      noBadgesLabel: t('share.card.noBadges'),
      badgeNames,
      watermark: t('share.card.watermark'),
    })
  }, [summary, osProfile, theme, t])

  const svgPreviewUrl = useMemo(() => {
    if (!svgMarkup) return ''
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`
  }, [svgMarkup])

  if (!open || !osProfile) return null

  const fileStem = `life-os-card-${osProfile.version.replace(/[^a-zA-Z0-9.-]+/g, '-').toLowerCase()}`

  const handleDownloadSvg = () => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    triggerDownload(blob, `${fileStem}.svg`)
    onNotify?.(t('share.svgDone'), 'success')
  }

  const handleDownloadPng = async () => {
    if (exportingPng) return
    setExportingPng(true)
    try {
      const pngBlob = await renderSvgToPngBlob(svgMarkup, 840, 520, 2)
      triggerDownload(pngBlob, `${fileStem}@2x.png`)
      onNotify?.(t('share.pngDone'), 'success')
    } catch {
      onNotify?.(t('share.pngError'), 'error')
    } finally {
      setExportingPng(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('share.title')}
      description={t('share.desc')}
      closeLabel={t('drawer.close')}
      className={css.modal}
      contentClassName={css.content}
      footer={
        <div className={css.footer}>
          <span className={css.privacyTip}>
            <IconShieldCheck size={14} />
            <span>{t('share.privacyNote')}</span>
          </span>
          <div className={css.footerActions}>
            <Button
              variant="outline"
              size="sm"
              icon={<IconDownload size={14} />}
              onClick={handleDownloadSvg}
            >
              {t('share.downloadSvg')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<IconImage size={14} />}
              disabled={exportingPng}
              onClick={() => void handleDownloadPng()}
            >
              {exportingPng ? t('share.exportingPng') : t('share.downloadPng')}
            </Button>
          </div>
        </div>
      }
    >
      <div className={css.toolbar}>
        <div className={css.themeSwitch} role="group" aria-label={t('share.title')}>
          <button
            type="button"
            className={clsx(css.themeBtn, theme === 'dark' && css.themeBtnActive)}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
          >
            {t('share.themeDark')}
          </button>
          <button
            type="button"
            className={clsx(css.themeBtn, theme === 'editorial' && css.themeBtnActive)}
            aria-pressed={theme === 'editorial'}
            onClick={() => setTheme('editorial')}
          >
            {t('share.themeEditorial')}
          </button>
        </div>
        <span className={css.versionCode}>{osProfile.version}</span>
      </div>

      <div className={css.previewFrame}>
        <img
          className={css.previewImg}
          src={svgPreviewUrl}
          alt={osProfile.archetype}
          width={840}
          height={520}
        />
      </div>
    </Modal>
  )
}

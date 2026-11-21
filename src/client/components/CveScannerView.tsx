import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { CveScanReport } from '../../shared/cve.ts'
import type { ItemStatus, VulnerabilitySeverity } from '../../shared/types.ts'
import type { HowToLiveLocaleKey } from '../locales.ts'
import {
  IconBookmark,
  IconCheck,
  IconChevronRight,
  IconEyeOff,
  IconShieldAlert,
  IconShieldCheck,
} from './Icons.tsx'
import css from './CveScannerView.module.css'

const CVE_PAGE_SIZE = 24

type SeverityFilter = 'all' | VulnerabilitySeverity

const REASON_KEY_MAP: Record<string, HowToLiveLocaleKey | undefined> = {
  tierSZeroCost: 'cve.reason.tierSZeroCost',
  tierSLowCost: 'cve.reason.tierSLowCost',
  tierSProfileMatch: 'cve.reason.tierSProfileMatch',
  tierSHighRoi: 'cve.reason.tierSHighRoi',
  tierAProfileMatch: 'cve.reason.tierAProfileMatch',
  tierAZeroGradeA: 'cve.reason.tierAZeroGradeA',
}

export interface CveScannerViewProps {
  readonly report: CveScanReport
  readonly busyId: string | null
  readonly onSetStatus: (id: string, status: ItemStatus) => void
  readonly onOpenDetail: (id: string) => void
  readonly t: TranslateNS<'howtolive'>
}

/**
 * 「人生漏洞扫描仪」（LIFE-CVE 安全审计视图）：
 * - 顶部安全状态仪表条展示 Exposed / Guarded / Hardened 评级、高危/中高危计数与系统加固度
 * - 每张漏洞卡支持一键修复（done）、排期修复（planned）、误报/不适用（skipped）与查看修复指南
 */
export function CveScannerView({
  report,
  busyId,
  onSetStatus,
  onOpenDetail,
  t,
}: CveScannerViewProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [visibleCount, setVisibleCount] = useState(CVE_PAGE_SIZE)

  useEffect(() => {
    setVisibleCount(CVE_PAGE_SIZE)
  }, [severityFilter, report.vulnerabilities.length])

  const filteredVulns = useMemo(() => {
    if (severityFilter === 'all') return report.vulnerabilities
    return report.vulnerabilities.filter((v) => v.severity === severityFilter)
  }, [report.vulnerabilities, severityFilter])

  const visibleVulns = useMemo(
    () => filteredVulns.slice(0, visibleCount),
    [filteredVulns, visibleCount],
  )

  const statusToneClass =
    report.status === 'Hardened'
      ? css.statusHardened
      : report.status === 'Guarded'
        ? css.statusGuarded
        : css.statusExposed

  const statusLabelKey: HowToLiveLocaleKey =
    report.status === 'Hardened'
      ? 'cve.status.Hardened'
      : report.status === 'Guarded'
        ? 'cve.status.Guarded'
        : 'cve.status.Exposed'

  return (
    <section className={css.wrap} aria-label={t('cve.title')}>
      {/* 顶部安全态势仪表条 */}
      <div className={clsx(css.summaryBanner, statusToneClass)}>
        <div className={css.summaryHead}>
          <div className={css.titleCluster}>
            <span className={css.shieldIcon} aria-hidden="true">
              {report.status === 'Hardened' ? <IconShieldCheck size={18} /> : <IconShieldAlert size={18} />}
            </span>
            <div className={css.titleText}>
              <div className={css.titleRow}>
                <h2 className={css.title}>{t('cve.title')}</h2>
                <span className={clsx(css.statusBadge, statusToneClass)}>
                  <span className={css.statusDot} aria-hidden="true" />
                  {t(statusLabelKey)}
                </span>
              </div>
              <p className={css.subtitle}>{t('cve.subtitle')}</p>
            </div>
          </div>

          <div className={css.metrics}>
            <div className={css.metricBox}>
              <span className={css.metricLabel}>{t('cve.metric.critical')}</span>
              <span className={clsx(css.metricValue, report.criticalCount > 0 && css.metricCritical)}>
                {report.criticalCount}
              </span>
            </div>
            <div className={css.metricBox}>
              <span className={css.metricLabel}>{t('cve.metric.high')}</span>
              <span className={clsx(css.metricValue, report.highCount > 0 && css.metricHigh)}>
                {report.highCount}
              </span>
            </div>
            <div className={clsx(css.metricBox, css.metricHardening)}>
              <div className={css.hardeningHead}>
                <span className={css.metricLabel}>{t('cve.metric.hardening')}</span>
                <span className={css.hardeningPct}>{report.hardeningRate}%</span>
              </div>
              <div className={css.progressTrack} aria-hidden="true">
                <div
                  className={clsx(css.progressFill, statusToneClass)}
                  style={{ width: `${report.hardeningRate}%` }}
                />
              </div>
              <span className={css.patchedHint}>
                {t('cve.metric.patched', { patched: report.patchedHighValueCount })}
              </span>
            </div>
          </div>
        </div>

        {/* 严重等级过滤胶囊 */}
        <div className={css.severityTabs} role="group" aria-label={t('cve.title')}>
          <button
            type="button"
            className={clsx(css.sevTab, severityFilter === 'all' && css.sevTabActive)}
            aria-pressed={severityFilter === 'all'}
            onClick={() => setSeverityFilter('all')}
          >
            {t('cve.filter.all', { count: report.vulnerabilities.length })}
          </button>
          <button
            type="button"
            className={clsx(css.sevTab, severityFilter === 'CRITICAL' && css.sevTabActive)}
            aria-pressed={severityFilter === 'CRITICAL'}
            onClick={() => setSeverityFilter('CRITICAL')}
          >
            {t('cve.filter.critical', { count: report.criticalCount })}
          </button>
          <button
            type="button"
            className={clsx(css.sevTab, severityFilter === 'HIGH' && css.sevTabActive)}
            aria-pressed={severityFilter === 'HIGH'}
            onClick={() => setSeverityFilter('HIGH')}
          >
            {t('cve.filter.high', { count: report.highCount })}
          </button>
        </div>
      </div>

      {/* 漏洞清单 */}
      {visibleVulns.length === 0 ? (
        <div className={css.emptyCard}>
          <span className={css.emptyIcon} aria-hidden="true">
            <IconShieldCheck size={24} />
          </span>
          <h3 className={css.emptyTitle}>{t('cve.emptyTitle')}</h3>
          <p className={css.emptyDesc}>{t('cve.emptyDesc')}</p>
        </div>
      ) : (
        <div className={css.list}>
          {visibleVulns.map((vuln) => {
            const { item } = vuln
            const isCritical = vuln.severity === 'CRITICAL'
            const isPlanned = vuln.status === 'planned'
            const isBusy = busyId === item.id
            const reasonKey = REASON_KEY_MAP[vuln.reason]

            return (
              <article
                key={vuln.cveId}
                className={clsx(
                  css.vulnCard,
                  isCritical ? css.vulnCritical : css.vulnHigh,
                  isPlanned && css.vulnPlanned,
                )}
              >
                <div className={css.cardTop}>
                  <div className={css.codeGroup}>
                    <code className={css.cveCode}>{vuln.cveId}</code>
                    <span className={clsx(css.sevBadge, isCritical ? css.sevCritical : css.sevHigh)}>
                      {vuln.severity}
                    </span>
                    <span className={css.reasonTag}>
                      {reasonKey ? t(reasonKey) : vuln.reason}
                    </span>
                  </div>
                  <div className={css.metaRight}>
                    <span className={css.chapterText}>{item.chapterTitle}</span>
                    <span className={css.xpText}>+{item.xp} XP</span>
                  </div>
                </div>

                <button
                  type="button"
                  className={css.bodyTrigger}
                  onClick={() => onOpenDetail(item.id)}
                >
                  <h3 className={css.itemTitle}>{item.title}</h3>
                  <p className={css.plain}>{item.plain}</p>
                </button>

                <div className={css.cardFooter}>
                  <div className={css.actionGroup}>
                    <button
                      type="button"
                      className={css.fixBtn}
                      disabled={isBusy}
                      onClick={() => onSetStatus(item.id, 'done')}
                    >
                      <IconCheck size={13} />
                      <span>{t('cve.action.fix')}</span>
                    </button>

                    <button
                      type="button"
                      className={clsx(css.secBtn, isPlanned && css.secBtnPlanned)}
                      disabled={isBusy}
                      onClick={() => onSetStatus(item.id, isPlanned ? 'todo' : 'planned')}
                    >
                      <IconBookmark size={13} />
                      <span>{isPlanned ? t('cve.action.planned') : t('cve.action.plan')}</span>
                    </button>

                    <button
                      type="button"
                      className={css.secBtn}
                      disabled={isBusy}
                      onClick={() => onSetStatus(item.id, 'skipped')}
                    >
                      <IconEyeOff size={13} />
                      <span>{t('cve.action.falsePositive')}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    className={css.guideBtn}
                    onClick={() => onOpenDetail(item.id)}
                  >
                    <span>{t('cve.action.guide')}</span>
                    <IconChevronRight size={14} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {visibleCount < filteredVulns.length && (
        <div className={css.loadMoreWrap}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisibleCount((c) => c + CVE_PAGE_SIZE)}
          >
            {t('cve.loadMore', { remaining: filteredVulns.length - visibleCount })}
          </Button>
        </div>
      )}
    </section>
  )
}

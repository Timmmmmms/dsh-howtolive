import clsx from 'clsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DimensionId, ScoreSummary } from '../../shared/types.ts'
import css from './LifeRadarCard.module.css'

export interface LifeRadarCardProps {
  readonly summary: ScoreSummary
  readonly activeDimension: DimensionId | 'all'
  readonly onSelectDimension: (dim: DimensionId | 'all') => void
  readonly t: TranslateNS<'howtolive'>
}

const CX = 130
const CY = 108
const MAX_R = 68
const RINGS = [0.25, 0.5, 0.75, 1]

function polarPoint(index: number, total: number, radius: number): [number, number] {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / total
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)]
}

function polygonPoints(ratios: readonly number[]): string {
  const total = ratios.length
  return ratios
    .map((r, i) => {
      const [x, y] = polarPoint(i, total, MAX_R * r)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

/**
 * 人生六维防御雷达与等级进度卡：
 * - SVG 六边形雷达带柔和渐变填充、发光顶点与点击维度联动筛选
 * - 右侧展示醒目总体覆盖率、流光 XP 进度条与带迷你进度底条的六维胶囊
 */
export function LifeRadarCard({
  summary,
  activeDimension,
  onSelectDimension,
  t,
}: LifeRadarCardProps) {
  const dims = summary.dimensions
  const count = dims.length || 6
  const ratios = dims.map((d) => Math.max(0.14, d.completionRate / 100))

  const weakest = dims
    .filter((d) => d.effectiveTotal > 0)
    .slice()
    .sort((a, b) => a.completionRate - b.completionRate)[0]

  const remainingXp = summary.level.nextLevelXp !== null
    ? Math.max(0, summary.level.nextLevelXp - summary.totalXp)
    : 0

  return (
    <section className={css.card} aria-label={t('radar.title')}>
      <div className={css.header}>
        <div className={css.titleGroup}>
          <h2 className={css.title}>{t('radar.title')}</h2>
          <span className={css.hint}>{t('radar.clickHint')}</span>
        </div>
        <span className={css.levelBadge}>
          <span className={css.levelDot} aria-hidden="true" />
          Lv.{summary.level.level} {summary.level.title}
        </span>
      </div>

      <div className={css.body}>
        <div className={css.radarWrap}>
          <svg
            className={css.radarSvg}
            width={240}
            height={200}
            viewBox="0 0 260 216"
            role="img"
            aria-label={t('radar.title')}
          >
            <defs>
              <radialGradient id="howtoliveRadarFill" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="var(--dsw-alias-state-business-primary)" stopOpacity="0.34" />
                <stop offset="100%" stopColor="var(--dsw-alias-state-business-primary)" stopOpacity="0.08" />
              </radialGradient>
            </defs>

            {RINGS.map((r, idx) => (
              <polygon
                key={r}
                className={clsx(css.ring, idx === RINGS.length - 1 && css.ringOuter)}
                points={polygonPoints(Array.from({ length: count }, () => r))}
              />
            ))}

            {dims.map((dim, idx) => {
              const [x2, y2] = polarPoint(idx, count, MAX_R)
              return (
                <line
                  key={`spoke-${dim.id}`}
                  className={css.spoke}
                  x1={CX}
                  y1={CY}
                  x2={x2}
                  y2={y2}
                />
              )
            })}

            <polygon
              className={css.radarArea}
              fill="url(#howtoliveRadarFill)"
              points={polygonPoints(ratios)}
            />

            {dims.map((dim, idx) => {
              const [vx, vy] = polarPoint(idx, count, MAX_R * (ratios[idx] ?? 0.14))
              const [lx, ly] = polarPoint(idx, count, MAX_R + 23)
              const isActive = activeDimension === dim.id
              const anchor = Math.abs(lx - CX) < 8 ? 'middle' : lx > CX ? 'start' : 'end'

              return (
                <g key={dim.id}>
                  <circle className={css.radarVertexHalo} cx={vx} cy={vy} r={6.5} />
                  <circle className={css.radarVertex} cx={vx} cy={vy} r={3} />
                  <g
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
                    className={clsx(css.axisButton, isActive && css.axisButtonActive)}
                    onClick={() => onSelectDimension(isActive ? 'all' : dim.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectDimension(isActive ? 'all' : dim.id)
                      }
                    }}
                  >
                    <text x={lx} y={ly - 2} textAnchor={anchor}>
                      {dim.name}
                    </text>
                    <text className={css.axisRate} x={lx} y={ly + 11} textAnchor={anchor}>
                      {dim.completionRate}%
                    </text>
                  </g>
                </g>
              )
            })}
          </svg>
        </div>

        <div className={css.metricsCol}>
          <div className={css.heroMetric}>
            <div className={css.rateRow}>
              <span className={css.bigRate}>{summary.overallRate}%</span>
              <span className={css.rateCaption}>
                {t('radar.stats', {
                  done: summary.doneCount,
                  effective: summary.effectiveCount,
                  planned: summary.plannedCount,
                  skipped: summary.skippedCount,
                })}
              </span>
            </div>
            <div className={css.xpBox}>
              <div className={css.xpTrack} role="progressbar" aria-valuenow={summary.level.progressPct} aria-valuemin={0} aria-valuemax={100}>
                <div className={css.xpFill} style={{ width: `${Math.max(4, summary.level.progressPct)}%` }} />
              </div>
              <div className={css.xpMeta}>
                <span>
                  {summary.level.nextLevelXp !== null
                    ? t('radar.xpProgress', { xp: summary.totalXp, remaining: remainingXp })
                    : t('radar.maxLevel', { xp: summary.totalXp })}
                </span>
                {weakest && weakest.completionRate < 100 && (
                  <span className={css.weakestTip}>
                    {t('radar.weakest', { name: weakest.name, rate: weakest.completionRate })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className={css.dimGrid}>
            {dims.map((dim) => {
              const isActive = activeDimension === dim.id
              return (
                <button
                  key={dim.id}
                  type="button"
                  className={clsx(css.dimCell, isActive && css.dimCellActive)}
                  aria-pressed={isActive}
                  onClick={() => onSelectDimension(isActive ? 'all' : dim.id)}
                >
                  <div className={css.dimTop}>
                    <span className={css.dimName}>{dim.name}</span>
                    <span className={css.dimValue}>{dim.done}/{dim.effectiveTotal}</span>
                  </div>
                  <div className={css.dimMiniTrack}>
                    <div
                      className={css.dimMiniFill}
                      style={{ width: `${dim.completionRate}%` }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

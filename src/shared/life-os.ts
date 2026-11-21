import { computeBadges } from './badges.ts'
import { scanLifeVulnerabilities } from './cve.ts'
import type {
  DimensionId,
  ItemProgress,
  KnowledgeItemSummary,
  LifeOsProfile,
  ScoreSummary,
  SecurityStatus,
  UserProfile,
} from './types.ts'

/** 人生 OS 趣味流派标识 */
export type LifeOsArchetypeKey =
  | 'init-kernel'
  | 'hexagon-architect'
  | 'longevity-monk'
  | 'bio-guardian'
  | 'compound-master'
  | 'cyber-firewall'
  | 'efficiency-hacker'
  | 'hearth-keeper'
  | 'chaos-survivor'

const ARCHETYPE_DEFAULTS: Record<LifeOsArchetypeKey, { readonly name: string; readonly tagline: string }> = {
  'init-kernel': {
    name: '待装补丁的裸机系统',
    tagline: '尚未安装核心防线，建议从零成本 S 级补丁起步',
  },
  'hexagon-architect': {
    name: '六边形系统架构师',
    tagline: '六维防线均衡稳固，具备出色的全局抗风险能力',
  },
  'longevity-monk': {
    name: '长命百岁月光族',
    tagline: '生命防线拉满，但财富护城河仍有可观加固空间',
  },
  'bio-guardian': {
    name: '生命防线铁壁',
    tagline: '把活着与健康设为最高优先级，意外与慢病防线扎实',
  },
  'compound-master': {
    name: '低耗能复利大师',
    tagline: '精打细算、守住财务底线，用最小成本撬动长期复利',
  },
  'cyber-firewall': {
    name: '赛博法外防火墙',
    tagline: '熟稔普通人与技术人法律红线，风险前置隔离到位',
  },
  'efficiency-hacker': {
    name: '高杠杆效率极客',
    tagline: '专注精力、时间与职场护城河，拒绝低效内耗',
  },
  'hearth-keeper': {
    name: '家庭秩序守护者',
    tagline: '在婚恋、育儿与养老关键节点提前布防，从容应对变故',
  },
  'chaos-survivor': {
    name: '赛博韧性幸存者',
    tagline: '账号信息安全与心理抗压双修，极端环境下仍能快速重启',
  },
}

/**
 * 根据六维偏科特征解析趣味流派标识（确定性纯函数）。
 */
export function resolveLifeOsArchetypeKey(summary: ScoreSummary): LifeOsArchetypeKey {
  if (summary.doneCount <= 0) return 'init-kernel'

  const effectiveDims = summary.dimensions.filter((d) => d.effectiveTotal > 0)
  if (effectiveDims.length === 0) return 'init-kernel'

  const rates = effectiveDims.map((d) => d.completionRate)
  const minRate = Math.min(...rates)
  const maxRate = Math.max(...rates)

  if (effectiveDims.length >= 6 && minRate >= 20 && maxRate - minRate <= 20) {
    return 'hexagon-architect'
  }

  const sorted = [...effectiveDims].sort(
    (a, b) => b.completionRate - a.completionRate || b.done - a.done,
  )
  const top = sorted[0]!
  const rateById = new Map<DimensionId, number>(effectiveDims.map((d) => [d.id, d.completionRate]))

  switch (top.id) {
    case 'survival': {
      const wealthRate = rateById.get('wealth') ?? 0
      if (top.completionRate - wealthRate >= 25 && wealthRate < 30) {
        return 'longevity-monk'
      }
      return 'bio-guardian'
    }
    case 'wealth':
      return 'compound-master'
    case 'legal':
      return 'cyber-firewall'
    case 'career':
      return 'efficiency-hacker'
    case 'family':
      return 'hearth-keeper'
    case 'resilience':
      return 'chaos-survivor'
    default:
      return 'hexagon-architect'
  }
}

/**
 * 生成极客风人生 OS 版本号，例如 `LifeOS v4.2.18-lts`。
 */
export function formatLifeOsVersion(summary: ScoreSummary, securityStatus: SecurityStatus): string {
  const major = Math.max(1, summary.level.level)
  const minor = Math.floor(Math.max(0, Math.min(100, summary.overallRate)) / 10)
  const patch = Math.max(0, summary.doneCount) % 100
  const channel = securityStatus === 'Hardened'
    ? 'lts'
    : securityStatus === 'Guarded'
      ? 'stable'
      : 'beta'
  return `LifeOS v${major}.${minor}.${patch}-${channel}`
}

/**
 * 纯函数计算可分享的「人生 OS 架构师名片」画像。
 * 严格脱敏：仅包含版本号、流派称号、安全评级、总体覆盖率、等级 XP、六维得分与代表徽章，
 * 绝不暴露任何个人画像字段或私有笔记文本。
 */
export function computeLifeOsProfile(
  summary: ScoreSummary,
  items: readonly KnowledgeItemSummary[],
  progressMap: Readonly<Record<string, ItemProgress | undefined>>,
  profile?: UserProfile,
): LifeOsProfile {
  const cveReport = scanLifeVulnerabilities(items, progressMap, profile)
  const badges = computeBadges(items, progressMap, summary)
  const featuredBadges = badges.filter((b) => b.unlocked).slice(0, 3)

  const archetypeKey = resolveLifeOsArchetypeKey(summary)
  const fallback = ARCHETYPE_DEFAULTS[archetypeKey]

  return {
    version: formatLifeOsVersion(summary, cveReport.status),
    archetype: fallback.name,
    tagline: fallback.tagline,
    securityStatus: cveReport.status,
    overallRate: summary.overallRate,
    level: summary.level,
    dimensions: summary.dimensions,
    featuredBadges,
  }
}

/** 自包含 SVG 名片渲染主题与本地化文案选项 */
export interface LifeOsCardSvgOptions {
  readonly theme: 'dark' | 'editorial'
  readonly archetypeTitle: string
  readonly archetypeTagline: string
  readonly securityLabel: string
  readonly coverageLabel: string
  readonly levelLabel: string
  readonly badgesTitle: string
  readonly noBadgesLabel: string
  readonly badgeNames?: Readonly<Record<string, string>>
  readonly watermark: string
}

function escapeXml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;')
}

function truncateText(raw: string, maxLen: number): string {
  return raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw
}

/**
 * 构建完全自包含内联样式的纯 SVG 名片字符串（840×520），
 * 不依赖外部 CSS 变量或网页字体，导出后在任意图片查看器中样式不丢失。
 */
export function buildLifeOsCardSvg(
  profile: LifeOsProfile,
  options: LifeOsCardSvgOptions,
): string {
  const isDark = options.theme === 'dark'
  const palette = isDark
    ? {
        bgStart: '#0b1020',
        bgEnd: '#131b31',
        cardBg: '#151e36',
        border: '#273459',
        textPrimary: '#f8fafc',
        textSecondary: '#cbd5e1',
        textMuted: '#8b9dc3',
        accent: '#4f8cff',
        accentSoft: 'rgba(79, 140, 255, 0.24)',
        accentStroke: '#60a5fa',
        track: '#1f2b4a',
        ring: '#2b3a63',
        badgeBg: '#1c2847',
        badgeBorder: '#334776',
        statusBg:
          profile.securityStatus === 'Hardened'
            ? 'rgba(16, 185, 129, 0.18)'
            : profile.securityStatus === 'Guarded'
              ? 'rgba(245, 158, 11, 0.18)'
              : 'rgba(239, 68, 68, 0.18)',
        statusColor:
          profile.securityStatus === 'Hardened'
            ? '#34d399'
            : profile.securityStatus === 'Guarded'
              ? '#fbbf24'
              : '#f87171',
      }
    : {
        bgStart: '#f8fafc',
        bgEnd: '#eef2ff',
        cardBg: '#ffffff',
        border: '#dbe3f0',
        textPrimary: '#0f172a',
        textSecondary: '#334155',
        textMuted: '#64748b',
        accent: '#2563eb',
        accentSoft: 'rgba(37, 99, 235, 0.18)',
        accentStroke: '#2563eb',
        track: '#e2e8f0',
        ring: '#cbd5e1',
        badgeBg: '#f1f5f9',
        badgeBorder: '#cbd5e1',
        statusBg:
          profile.securityStatus === 'Hardened'
            ? 'rgba(5, 150, 105, 0.12)'
            : profile.securityStatus === 'Guarded'
              ? 'rgba(217, 119, 6, 0.12)'
              : 'rgba(220, 38, 38, 0.12)',
        statusColor:
          profile.securityStatus === 'Hardened'
            ? '#047857'
            : profile.securityStatus === 'Guarded'
              ? '#b45309'
              : '#b91c1c',
      }

  const fontSans = 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif'
  const fontMono = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

  // 六维雷达图几何参数
  const cx = 200
  const cy = 278
  const maxR = 86
  const dims = profile.dimensions
  const count = dims.length || 6
  const polar = (idx: number, r: number): [number, number] => {
    const angle = -Math.PI / 2 + (idx * Math.PI * 2) / count
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  }
  const poly = (ratios: number[]): string =>
    ratios
      .map((ratio, i) => {
        const [x, y] = polar(i, maxR * ratio)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  const ringsSvg = [0.25, 0.5, 0.75, 1]
    .map((r, i) => {
      const dash = i === 3 ? ' stroke-dasharray="3 3"' : ''
      return `<polygon points="${poly(Array.from({ length: count }, () => r))}" fill="none" stroke="${palette.ring}" stroke-width="1"${dash} />`
    })
    .join('\n    ')

  const spokesSvg = dims
    .map((_, idx) => {
      const [x2, y2] = polar(idx, maxR)
      return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${palette.ring}" stroke-width="1" />`
    })
    .join('\n    ')

  const dataRatios = dims.map((d) => Math.max(0.14, d.completionRate / 100))
  const areaSvg = `<polygon points="${poly(dataRatios)}" fill="${palette.accentSoft}" stroke="${palette.accentStroke}" stroke-width="2.2" stroke-linejoin="round" />`

  const verticesAndLabelsSvg = dims
    .map((d, idx) => {
      const [vx, vy] = polar(idx, maxR * (dataRatios[idx] ?? 0.14))
      const [lx, ly] = polar(idx, maxR + 24)
      const anchor = Math.abs(lx - cx) < 10 ? 'middle' : lx > cx ? 'start' : 'end'
      return [
        `<circle cx="${vx.toFixed(1)}" cy="${vy.toFixed(1)}" r="4" fill="${palette.accentStroke}" stroke="${palette.cardBg}" stroke-width="1.6" />`,
        `<text x="${lx.toFixed(1)}" y="${(ly - 2).toFixed(1)}" text-anchor="${anchor}" fill="${palette.textSecondary}" font-size="11.5" font-weight="600" font-family="${fontSans}">${escapeXml(d.name)}</text>`,
        `<text x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" text-anchor="${anchor}" fill="${palette.textMuted}" font-size="10.5" font-family="${fontMono}">${d.completionRate}%</text>`,
      ].join('\n    ')
    })
    .join('\n    ')

  // 右侧六维柱状条
  const dimBarsSvg = dims
    .map((d, idx) => {
      const y = 212 + idx * 30
      const barWidth = Math.round((Math.max(0, Math.min(100, d.completionRate)) / 100) * 210)
      return [
        `<text x="410" y="${y}" fill="${palette.textSecondary}" font-size="12" font-weight="500" font-family="${fontSans}">${escapeXml(d.name)}</text>`,
        `<text x="790" y="${y}" text-anchor="end" fill="${palette.textMuted}" font-size="11.5" font-family="${fontMono}">${d.completionRate}% (${d.done}/${d.effectiveTotal})</text>`,
        `<rect x="410" y="${y + 7}" width="380" height="6" rx="3" fill="${palette.track}" />`,
        `<rect x="410" y="${y + 7}" width="${Math.max(d.completionRate > 0 ? 8 : 0, Math.round((barWidth / 210) * 380))}" height="6" rx="3" fill="${palette.accent}" />`,
      ].join('\n    ')
    })
    .join('\n    ')

  // 底部代表徽章胶囊
  const badgeNodes = profile.featuredBadges.length > 0
    ? profile.featuredBadges
        .slice(0, 3)
        .map((badge, idx) => {
          const x = 44 + idx * 176
          const label = truncateText(options.badgeNames?.[badge.id] ?? badge.name, 12)
          return [
            `<rect x="${x}" y="434" width="164" height="32" rx="16" fill="${palette.badgeBg}" stroke="${palette.badgeBorder}" stroke-width="1" />`,
            `<circle cx="${x + 18}" cy="450" r="5" fill="${palette.accent}" />`,
            `<text x="${x + 31}" y="454" fill="${palette.textPrimary}" font-size="12" font-weight="600" font-family="${fontSans}">${escapeXml(label)}</text>`,
          ].join('\n    ')
        })
        .join('\n    ')
    : `<text x="44" y="454" fill="${palette.textMuted}" font-size="12" font-family="${fontSans}">${escapeXml(options.noBadgesLabel)}</text>`

  const xpBarWidth = Math.round((Math.max(4, profile.level.progressPct) / 100) * 220)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="840" height="520" viewBox="0 0 840 520" role="img" aria-label="${escapeXml(options.archetypeTitle)}">
  <defs>
    <linearGradient id="lifeOsBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bgStart}" />
      <stop offset="100%" stop-color="${palette.bgEnd}" />
    </linearGradient>
    <linearGradient id="lifeOsXp" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${palette.accent}" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>

  <rect width="840" height="520" rx="24" fill="url(#lifeOsBg)" />
  <rect x="20" y="20" width="800" height="480" rx="18" fill="${palette.cardBg}" stroke="${palette.border}" stroke-width="1.2" />

  <!-- 顶部极客状态栏 -->
  <rect x="44" y="42" width="210" height="28" rx="14" fill="${palette.badgeBg}" stroke="${palette.badgeBorder}" stroke-width="1" />
  <circle cx="62" cy="56" r="4.5" fill="${palette.accent}" />
  <text x="74" y="60.5" fill="${palette.textPrimary}" font-size="12" font-weight="600" font-family="${fontMono}">${escapeXml(profile.version)}</text>

  <rect x="614" y="42" width="182" height="28" rx="14" fill="${palette.statusBg}" />
  <text x="705" y="60.5" text-anchor="middle" fill="${palette.statusColor}" font-size="12" font-weight="700" font-family="${fontMono}">${escapeXml(options.securityLabel)}</text>

  <!-- 标题与流派称号 -->
  <text x="44" y="112" fill="${palette.textPrimary}" font-size="26" font-weight="700" font-family="${fontSans}">${escapeXml(truncateText(options.archetypeTitle, 24))}</text>
  <text x="44" y="137" fill="${palette.textMuted}" font-size="13" font-family="${fontSans}">${escapeXml(truncateText(options.archetypeTagline, 48))}</text>

  <!-- 右上总体覆盖率与等级 -->
  <text x="790" y="110" text-anchor="end" fill="${palette.textPrimary}" font-size="34" font-weight="700" font-family="${fontMono}">${profile.overallRate}%</text>
  <text x="790" y="132" text-anchor="end" fill="${palette.textMuted}" font-size="11.5" font-family="${fontSans}">${escapeXml(options.coverageLabel)}</text>

  <line x1="44" y1="156" x2="796" y2="156" stroke="${palette.border}" stroke-width="1" />

  <!-- 左侧六维雷达 -->
  <g>
    ${ringsSvg}
    ${spokesSvg}
    ${areaSvg}
    ${verticesAndLabelsSvg}
  </g>

  <!-- 右侧等级与六维进度条 -->
  <text x="410" y="182" fill="${palette.textPrimary}" font-size="13.5" font-weight="700" font-family="${fontSans}">${escapeXml(options.levelLabel)}</text>
  <rect x="570" y="173" width="220" height="8" rx="4" fill="${palette.track}" />
  <rect x="570" y="173" width="${xpBarWidth}" height="8" rx="4" fill="url(#lifeOsXp)" />

  <g>
    ${dimBarsSvg}
  </g>

  <!-- 底部代表徽章与脱敏水印 -->
  <line x1="44" y1="406" x2="796" y2="406" stroke="${palette.border}" stroke-width="1" />
  <text x="44" y="425" fill="${palette.textMuted}" font-size="11" font-weight="600" font-family="${fontSans}">${escapeXml(options.badgesTitle)}</text>
  <g>
    ${badgeNodes}
  </g>

  <text x="796" y="484" text-anchor="end" fill="${palette.textMuted}" font-size="11" font-family="${fontMono}">${escapeXml(options.watermark)}</text>
</svg>`
}

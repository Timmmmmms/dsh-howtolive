import type {
  DimensionId,
  ItemProgress,
  ItemStatus,
  KnowledgeItemSummary,
  LifeVulnerability,
  SecurityStatus,
  UserProfile,
  VulnerabilitySeverity,
} from './types.ts'

/** 漏洞扫描综合报告 */
export interface CveScanReport {
  /** 整体安全状态评级 */
  readonly status: SecurityStatus
  /** 系统加固度（0~100，高价值补丁的已完成百分比） */
  readonly hardeningRate: number
  /** 高危漏洞数（CRITICAL） */
  readonly criticalCount: number
  /** 中高危漏洞数（HIGH） */
  readonly highCount: number
  /** 扫描覆盖的有效条目总数（剔除 skipped） */
  readonly totalScanned: number
  /** 已修复的高价值条目数 */
  readonly patchedHighValueCount: number
  /** 未修复漏洞明细（按严重程度与综合风险分降序） */
  readonly vulnerabilities: LifeVulnerability[]
}

const GOAL_DIM_MAP: Record<string, DimensionId> = {
  health: 'survival',
  money: 'wealth',
  legal: 'legal',
  career: 'career',
  family: 'family',
  security: 'resilience',
}

/**
 * 计算单条建议与本地用户画像的匹配加分（与 Host 端推荐算法保持一致）。
 */
export function computeProfileMatchScore(
  item: KnowledgeItemSummary,
  profile: UserProfile | undefined,
): number {
  if (!profile) return 0
  let boost = 0
  const aud = item.tags?.audience ?? []

  if (profile.occupation === 'programmer' || profile.occupation === 'freelance') {
    if (item.chapterNumber === 11 || item.chapterNumber === 26 || item.chapterNumber === 14) {
      boost += 25
    }
  }
  if (profile.housing === 'renting' && item.chapterNumber === 15) boost += 25
  if (profile.housing === 'buying' && (item.chapterNumber === 15 || item.chapterNumber === 5)) boost += 20

  const family = profile.family ?? []
  if (family.includes('pregnant') && aud.includes('怀孕')) boost += 30
  if (family.includes('infant') && (aud.includes('婴幼儿') || aud.includes('孩子'))) boost += 30
  if (family.includes('child') && aud.includes('孩子')) boost += 25
  if (family.includes('elderly') && (aud.includes('老人') || aud.includes('60岁'))) boost += 25

  const goals = profile.goals ?? []
  for (const g of goals) {
    if (GOAL_DIM_MAP[g] === item.dimension) boost += 15
  }

  return boost
}

/**
 * 生成极客风人生漏洞编号，例如 `LIFE-CVE-14-02`。
 */
export function formatLifeCveId(item: Pick<KnowledgeItemSummary, 'chapterNumber' | 'number'>): string {
  const ch = String(item.chapterNumber).padStart(2, '0')
  const num = String(item.number).padStart(2, '0')
  return `LIFE-CVE-${ch}-${num}`
}

/**
 * 判定单条建议的漏洞严重等级与命中原因；不符合高价值漏洞条件则返回 null。
 */
function classifyVulnerability(
  item: KnowledgeItemSummary,
  profileBoost: number,
): { severity: VulnerabilitySeverity; reason: string } | null {
  const money = item.tags?.money ?? null
  const isZeroCost = money === '0'
  const isLowCost = money === '少'
  const isGradeA = item.evidenceGrade.trim().toUpperCase().startsWith('A')

  if (item.roiTier === 'S') {
    if (isZeroCost) {
      return { severity: 'CRITICAL', reason: 'tierSZeroCost' }
    }
    if (isLowCost) {
      return { severity: 'CRITICAL', reason: 'tierSLowCost' }
    }
    return {
      severity: 'HIGH',
      reason: profileBoost >= 15 ? 'tierSProfileMatch' : 'tierSHighRoi',
    }
  }

  if (item.roiTier === 'A') {
    if (profileBoost >= 15) {
      return { severity: 'HIGH', reason: 'tierAProfileMatch' }
    }
    if (isZeroCost && isGradeA) {
      return { severity: 'HIGH', reason: 'tierAZeroGradeA' }
    }
  }

  return null
}

/**
 * 人生漏洞扫描纯函数（确定性）：
 * - 筛选未完成（todo / planned）的高价值条目，结合画像加权分级为 CRITICAL / HIGH
 * - 统计高价值候选全集的加固度与系统整体安全评级（Exposed / Guarded / Hardened）
 */
export function scanLifeVulnerabilities(
  items: readonly KnowledgeItemSummary[],
  progressMap: Readonly<Record<string, ItemProgress | undefined>>,
  profile?: UserProfile,
): CveScanReport {
  const vulnerabilities: LifeVulnerability[] = []
  let totalScanned = 0
  let highValueTotal = 0
  let patchedHighValueCount = 0
  let criticalCount = 0
  let highCount = 0

  for (const item of items) {
    const status: ItemStatus = progressMap[item.id]?.status ?? 'todo'
    if (status === 'skipped') continue
    totalScanned++

    const profileBoost = computeProfileMatchScore(item, profile)
    const classified = classifyVulnerability(item, profileBoost)
    if (!classified) continue

    highValueTotal++
    if (status === 'done') {
      patchedHighValueCount++
      continue
    }

    const isZeroCost = item.tags?.money === '0'
    const noWillpower = item.tags?.willpower === '否'
    const score =
      item.roiScore
      + profileBoost
      + (classified.severity === 'CRITICAL' ? 40 : 0)
      + (isZeroCost ? 15 : 0)
      + (noWillpower ? 8 : 0)
      + (status === 'todo' ? 5 : 0)

    if (classified.severity === 'CRITICAL') {
      criticalCount++
    } else {
      highCount++
    }

    vulnerabilities.push({
      cveId: formatLifeCveId(item),
      severity: classified.severity,
      item,
      status,
      reason: classified.reason,
      score,
    })
  }

  vulnerabilities.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'CRITICAL' ? -1 : 1
    }
    if (b.score !== a.score) return b.score - a.score
    return a.item.chapterNumber - b.item.chapterNumber || a.item.number - b.item.number
  })

  const hardeningRate = highValueTotal > 0
    ? Math.round((patchedHighValueCount / highValueTotal) * 100)
    : 100

  let securityStatus: SecurityStatus
  if (
    (criticalCount === 0 && highCount === 0)
    || (hardeningRate >= 70 && criticalCount <= 3)
  ) {
    securityStatus = 'Hardened'
  } else if (
    (hardeningRate >= 35 && criticalCount <= 12)
    || (criticalCount === 0 && highCount > 0)
  ) {
    securityStatus = 'Guarded'
  } else {
    securityStatus = 'Exposed'
  }

  return {
    status: securityStatus,
    hardeningRate,
    criticalCount,
    highCount,
    totalScanned,
    patchedHighValueCount,
    vulnerabilities,
  }
}

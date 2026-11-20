import type {
  DimensionId,
  DimensionMeta,
  DimensionScore,
  ItemProgress,
  KnowledgeItemSummary,
  LevelInfo,
  ScoreSummary,
} from './types.ts'

/** 维度展示默认元信息（与 sync-howtolive.mjs 对齐） */
export const DEFAULT_DIMENSIONS: readonly DimensionMeta[] = [
  { id: 'survival', name: '生命防线', subtitle: '意外防护、急救、慢病与用药安全', chapterNumbers: [1, 2, 13, 16, 24, 28, 33, 34], itemCount: 0 },
  { id: 'wealth', name: '财富护城河', subtitle: '省钱避坑、财务底线、买房租房与创业', chapterNumbers: [5, 7, 12, 15], itemCount: 0 },
  { id: 'legal', name: '法律防坑盾', subtitle: '普通人红线、技术人红线与防身避祸', chapterNumbers: [6, 8, 9, 11, 26], itemCount: 0 },
  { id: 'career', name: '职场与效率', subtitle: '精力时间、技能投资、离职工伤与人生路径', chapterNumbers: [3, 4, 19, 23, 31, 32], itemCount: 0 },
  { id: 'family', name: '家庭与关系', subtitle: '婚恋、孕育、育儿、养老与身后事', chapterNumbers: [10, 17, 18, 20, 25, 27, 30], itemCount: 0 },
  { id: 'resilience', name: '安全与韧性', subtitle: '信息安全、境外安全、心理修复与放松', chapterNumbers: [14, 21, 22, 29], itemCount: 0 },
]

/** Lv.1 → Lv.10 经验阈值与头衔表 */
export const LEVEL_TABLE: ReadonlyArray<{ level: number; minXp: number; title: string }> = [
  { level: 1, minXp: 0, title: '初装补丁' },
  { level: 2, minXp: 100, title: '避坑学徒' },
  { level: 3, minXp: 300, title: '稳健行者' },
  { level: 4, minXp: 650, title: '循证生活家' },
  { level: 5, minXp: 1200, title: '风险防火墙' },
  { level: 6, minXp: 2000, title: '低耗能高手' },
  { level: 7, minXp: 3200, title: '复利守门人' },
  { level: 8, minXp: 5000, title: '高性价比大师' },
  { level: 9, minXp: 7800, title: '清醒决策官' },
  { level: 10, minXp: 12000, title: '人生系统架构师' },
]

/**
 * 根据累计 XP 计算当前等级、头衔与升级进度条。
 */
export function computeLevelInfo(totalXp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(totalXp))
  let current = LEVEL_TABLE[0]!
  let nextMin: number | null = LEVEL_TABLE[1]?.minXp ?? null

  for (let i = 0; i < LEVEL_TABLE.length; i++) {
    const entry = LEVEL_TABLE[i]!
    if (safeXp >= entry.minXp) {
      current = entry
      nextMin = LEVEL_TABLE[i + 1]?.minXp ?? null
    } else {
      break
    }
  }

  let progressPct = 100
  if (nextMin !== null) {
    const span = Math.max(1, nextMin - current.minXp)
    progressPct = Math.min(100, Math.max(0, Math.round(((safeXp - current.minXp) / span) * 100)))
  }

  return {
    level: current.level,
    title: current.title,
    totalXp: safeXp,
    currentLevelMinXp: current.minXp,
    nextLevelXp: nextMin,
    progressPct,
  }
}

/**
 * 计算六维属性得分、总 XP、等级和薄弱维度。
 * 公式：完成率 = done / (total - skipped)，跳过（不适用）的条目从分母中剔除。
 */
export function computeScoreSummary(
  items: readonly KnowledgeItemSummary[],
  progressMap: Readonly<Record<string, ItemProgress | undefined>>,
  dimensionsMeta: readonly DimensionMeta[] = DEFAULT_DIMENSIONS,
): ScoreSummary {
  const buckets = new Map<
    DimensionId,
    { total: number; done: number; planned: number; skipped: number; earnedXp: number; possibleXp: number }
  >()

  for (const dim of dimensionsMeta) {
    buckets.set(dim.id, { total: 0, done: 0, planned: 0, skipped: 0, earnedXp: 0, possibleXp: 0 })
  }

  let totalXp = 0
  let totalCount = 0
  let doneCount = 0
  let plannedCount = 0
  let skippedCount = 0

  for (const item of items) {
    const bucket = buckets.get(item.dimension)
    const status = progressMap[item.id]?.status ?? 'todo'
    totalCount++
    if (bucket) bucket.total++

    if (status === 'done') {
      doneCount++
      totalXp += item.xp
      if (bucket) {
        bucket.done++
        bucket.earnedXp += item.xp
        bucket.possibleXp += item.xp
      }
    } else if (status === 'planned') {
      plannedCount++
      if (bucket) {
        bucket.planned++
        bucket.possibleXp += item.xp
      }
    } else if (status === 'skipped') {
      skippedCount++
      if (bucket) bucket.skipped++
    } else {
      if (bucket) bucket.possibleXp += item.xp
    }
  }

  const dimensions: DimensionScore[] = dimensionsMeta.map((meta) => {
    const b = buckets.get(meta.id) ?? {
      total: 0,
      done: 0,
      planned: 0,
      skipped: 0,
      earnedXp: 0,
      possibleXp: 0,
    }
    const effectiveTotal = Math.max(0, b.total - b.skipped)
    const completionRate = effectiveTotal > 0 ? Math.round((b.done / effectiveTotal) * 100) : 0
    return {
      id: meta.id,
      name: meta.name,
      subtitle: meta.subtitle,
      total: b.total,
      done: b.done,
      planned: b.planned,
      skipped: b.skipped,
      effectiveTotal,
      completionRate,
      earnedXp: b.earnedXp,
      possibleXp: b.possibleXp,
    }
  })

  const effectiveCount = Math.max(0, totalCount - skippedCount)
  const overallRate = effectiveCount > 0 ? Math.round((doneCount / effectiveCount) * 100) : 0

  let weakestDimension: DimensionScore | null = null
  for (const dim of dimensions) {
    if (dim.effectiveTotal === 0) continue
    if (!weakestDimension || dim.completionRate < weakestDimension.completionRate) {
      weakestDimension = dim
    }
  }

  return {
    totalXp,
    level: computeLevelInfo(totalXp),
    totalCount,
    doneCount,
    plannedCount,
    skippedCount,
    effectiveCount,
    overallRate,
    dimensions,
    weakestDimension,
  }
}

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

const MS_PER_DAY = 86_400_000

/** 复检周期可选项（0 表示不重复） */
export const REVIEW_INTERVAL_OPTIONS = [0, 90, 180, 365] as const

/** 常见周期性条目的精确推荐复检周期映射表（单位：天） */
export const RECOMMENDED_REVIEW_INTERVALS: Readonly<Record<string, number>> = {
  '01-03': 180, // 烟雾报警器 / 一氧化碳报警器电池与自检
  '01-20': 365, // 流感疫苗年度接种
  '01-26': 365, // 灭火器、灭火毯、逃生面罩与急救包效期检查
  '05-44': 365, // 保单受益人与保障范围年度核对
  '06-18': 365, // 按年龄性别的循证体检筛查
}

const REVIEW_KEYWORD_RULES: ReadonlyArray<{ readonly pattern: RegExp; readonly days: number }> = [
  { pattern: /灭火器|急救包|急救箱|报警器|常备药|有效期|过期|效期|逃生面罩/, days: 180 },
  { pattern: /恢复码|备份|两步验证|密码管理|主密码|账号安全/, days: 180 },
  { pattern: /体检|筛查|流感疫苗|洗牙|保单|保险受益人|年度/, days: 365 },
]

/**
 * 推导单条建议的推荐复检周期（天数）；非周期性条目返回 null。
 */
export function getRecommendedReviewInterval(
  item: Pick<KnowledgeItemSummary, 'id' | 'chapterNumber' | 'title' | 'plain'>,
): number | null {
  const exact = RECOMMENDED_REVIEW_INTERVALS[item.id]
  if (exact !== undefined) return exact

  const text = `${item.title} ${item.plain}`
  for (const rule of REVIEW_KEYWORD_RULES) {
    if (rule.pattern.test(text)) return rule.days
  }

  // 第 34 章（常备药）与第 14 章（账号与信息安全）默认推荐半年巡检一次
  if (item.chapterNumber === 34 || item.chapterNumber === 14) {
    return 180
  }

  return null
}

/** 解析时间输入为 UTC 毫秒时间戳，非法输入返回 NaN */
function toTimestampMs(value: Date | number | string | undefined): number {
  if (value === undefined) return Number.NaN
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

/**
 * 计算单条已完成补丁的下一次复检日期；未完成或未配置复检周期返回 null。
 */
export function getItemNextReviewDate(progress: ItemProgress | undefined): Date | null {
  if (!progress || progress.status !== 'done') return null
  const intervalDays = progress.reviewIntervalDays
  if (typeof intervalDays !== 'number' || !Number.isFinite(intervalDays) || intervalDays <= 0) {
    return null
  }
  const baseMs = toTimestampMs(progress.lastReviewedAt ?? progress.updatedAt)
  if (Number.isNaN(baseMs)) return null
  return new Date(baseMs + Math.floor(intervalDays) * MS_PER_DAY)
}

/**
 * 判断单条补丁是否已到期需要复检（严格使用 UTC 毫秒差，避免本地时区与夏令时偏差）。
 * 注意：到期仅提示巡检，绝不扣除已获 XP。
 */
export function isItemDueForReview(
  progress: ItemProgress | undefined,
  now: Date | number | string = new Date(),
): boolean {
  const nextDate = getItemNextReviewDate(progress)
  if (!nextDate) return false
  const nowMs = toTimestampMs(now)
  if (Number.isNaN(nowMs)) return false
  return nowMs >= nextDate.getTime()
}

/**
 * 统计当前条目集合中已到期需要复检的补丁总数。
 */
export function countDueReviewItems(
  items: readonly Pick<KnowledgeItemSummary, 'id'>[],
  progressMap: Readonly<Record<string, ItemProgress | undefined>>,
  now: Date | number | string = new Date(),
): number {
  let count = 0
  for (const item of items) {
    if (isItemDueForReview(progressMap[item.id], now)) {
      count++
    }
  }
  return count
}

/**
 * 计算六维属性得分、总 XP、等级、薄弱维度和待复检数。
 * 公式：完成率 = done / (total - skipped)，跳过（不适用）的条目从分母中剔除。
 */
export function computeScoreSummary(
  items: readonly KnowledgeItemSummary[],
  progressMap: Readonly<Record<string, ItemProgress | undefined>>,
  dimensionsMeta: readonly DimensionMeta[] = DEFAULT_DIMENSIONS,
  now: Date | number | string = new Date(),
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

  const dueReviewCount = countDueReviewItems(items, progressMap, now)

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
    dueReviewCount,
  }
}

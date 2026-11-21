import { computeProfileMatchScore } from './cve.ts'
import type {
  DimensionId,
  ItemProgress,
  ItemStatus,
  KnowledgeItemSummary,
  RoiTier,
  ScoreSummary,
  UserProfile,
} from './types.ts'

/** 摸鱼 3 分钟速刷盲盒模式 */
export type SprintMode = 'zeroCost' | 'weakest' | 'planned'

const TIER_RANK: Record<RoiTier, number> = { S: 0, A: 1, B: 2, C: 3 }

/**
 * 为「摸鱼 3 分钟速刷盲盒」构建确定性抽卡队列（默认每次最多 8 条）。
 * - zeroCost：未完成的零花钱且不靠毅力条目优先，不足时补充其他零花钱条目
 * - weakest：当前最薄弱维度的未完成高性价比条目
 * - planned：行动清单中待执行的条目
 */
export function buildSprintDeck(options: {
  readonly mode: SprintMode
  readonly items: readonly KnowledgeItemSummary[]
  readonly progress: Readonly<Record<string, ItemProgress | undefined>>
  readonly summary?: ScoreSummary | null
  readonly profile?: UserProfile
  readonly excludeIds?: ReadonlySet<string>
  readonly limit?: number
}): KnowledgeItemSummary[] {
  const {
    mode,
    items,
    progress,
    summary,
    profile,
    excludeIds,
    limit = 8,
  } = options

  const safeLimit = Math.max(1, Math.min(10, limit))
  const isPending = (item: KnowledgeItemSummary): boolean => {
    if (excludeIds?.has(item.id)) return false
    const st: ItemStatus = progress[item.id]?.status ?? 'todo'
    return st === 'todo' || st === 'planned'
  }

  const rankItem = (a: KnowledgeItemSummary, b: KnowledgeItemSummary): number => {
    const scoreA = a.roiScore + computeProfileMatchScore(a, profile)
    const scoreB = b.roiScore + computeProfileMatchScore(b, profile)
    return (
      TIER_RANK[a.roiTier] - TIER_RANK[b.roiTier]
      || scoreB - scoreA
      || a.chapterNumber - b.chapterNumber
      || a.number - b.number
    )
  }

  if (mode === 'planned') {
    const planned = items.filter((item) => {
      if (excludeIds?.has(item.id)) return false
      return progress[item.id]?.status === 'planned'
    })
    return [...planned].sort(rankItem).slice(0, safeLimit)
  }

  if (mode === 'weakest') {
    const weakestId: DimensionId | null = summary?.weakestDimension?.id ?? null
    const pool = items.filter((item) => {
      if (!isPending(item)) return false
      if (weakestId && item.dimension !== weakestId) return false
      return true
    })
    return [...pool].sort(rankItem).slice(0, safeLimit)
  }

  // zeroCost 模式：优先 money === '0' && willpower === '否'，不足再补充 money === '0'
  const zeroNoWill: KnowledgeItemSummary[] = []
  const zeroOther: KnowledgeItemSummary[] = []
  for (const item of items) {
    if (!isPending(item)) continue
    if (item.tags?.money !== '0') continue
    if (item.tags.willpower === '否') {
      zeroNoWill.push(item)
    } else {
      zeroOther.push(item)
    }
  }
  zeroNoWill.sort(rankItem)
  zeroOther.sort(rankItem)
  return [...zeroNoWill, ...zeroOther].slice(0, safeLimit)
}

/**
 * 统计 3 个速刷模式当前各有多少可用条目（用于模式切换胶囊展示）。
 */
export function countSprintModeAvailability(
  items: readonly KnowledgeItemSummary[],
  progress: Readonly<Record<string, ItemProgress | undefined>>,
  summary?: ScoreSummary | null,
): Record<SprintMode, number> {
  const weakestId = summary?.weakestDimension?.id ?? null
  let zeroCost = 0
  let weakest = 0
  let planned = 0

  for (const item of items) {
    const st: ItemStatus = progress[item.id]?.status ?? 'todo'
    if (st === 'planned') planned++
    if (st === 'todo' || st === 'planned') {
      if (item.tags?.money === '0') zeroCost++
      if (!weakestId || item.dimension === weakestId) weakest++
    }
  }

  return { zeroCost, weakest, planned }
}

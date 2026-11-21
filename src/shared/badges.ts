import { computeScoreSummary } from './scoring.ts'
import type {
  BadgeId,
  BadgeInfo,
  ItemProgress,
  KnowledgeItemSummary,
  ScoreSummary,
} from './types.ts'

interface BadgeBuildArgs {
  id: BadgeId
  name: string
  description: string
  current: number
  target: number
  unlocked?: boolean
}

function makeBadge({ id, name, description, current, target, unlocked }: BadgeBuildArgs): BadgeInfo {
  const safeTarget = Math.max(1, target)
  const safeCurrent = Math.max(0, current)
  const isUnlocked = unlocked ?? safeCurrent >= safeTarget
  const progressPct = isUnlocked
    ? 100
    : Math.min(99, Math.max(0, Math.round((safeCurrent / safeTarget) * 100)))

  return {
    id,
    name,
    description,
    unlocked: isUnlocked,
    current: Math.min(safeCurrent, safeTarget),
    target: safeTarget,
    progressPct,
  }
}

/** 计算指定章节的有效完成率（百分比 0~100，剔除 skipped 条目；若无有效条目返回 null） */
function computeChapterCompletionPct(
  items: readonly KnowledgeItemSummary[],
  progressMap: Readonly<Record<string, ItemProgress | undefined>>,
  chapterNumber: number,
): { pct: number; effective: number } {
  let effective = 0
  let done = 0
  for (const item of items) {
    if (item.chapterNumber !== chapterNumber) continue
    const status = progressMap[item.id]?.status ?? 'todo'
    if (status === 'skipped') continue
    effective++
    if (status === 'done') done++
  }
  if (effective === 0) return { pct: 0, effective: 0 }
  return { pct: Math.round((done / effective) * 100), effective }
}

/**
 * 基于知识库条目与本地进度纯函数实时计算 10 枚成就徽章（无需额外持久化）。
 */
export function computeBadges(
  items: readonly KnowledgeItemSummary[],
  progressMap: Readonly<Record<string, ItemProgress | undefined>>,
  summary?: ScoreSummary,
): BadgeInfo[] {
  const resolvedSummary = summary ?? computeScoreSummary(items, progressMap)

  let doneCount = 0
  let zeroCostNoWillpowerDone = 0
  let skippedCount = 0
  let sTierDone = 0
  let notedCount = 0
  let reviewConfiguredOrDone = 0
  let ch13STierTotal = 0
  let ch13STierDone = 0

  for (const item of items) {
    const rec = progressMap[item.id]
    const status = rec?.status ?? 'todo'

    if (rec?.note && rec.note.trim().length > 0) {
      notedCount++
    }

    if (item.chapterNumber === 13 && item.roiTier === 'S' && status !== 'skipped') {
      ch13STierTotal++
      if (status === 'done') ch13STierDone++
    }

    if (status === 'skipped') {
      skippedCount++
      continue
    }

    if (status === 'done') {
      doneCount++
      if (item.tags?.money === '0' && item.tags?.willpower === '否') {
        zeroCostNoWillpowerDone++
      }
      if (item.roiTier === 'S') {
        sTierDone++
      }
      if ((rec?.reviewIntervalDays && rec.reviewIntervalDays > 0) || Boolean(rec?.lastReviewedAt)) {
        reviewConfiguredOrDone++
      }
    }
  }

  const ch14 = computeChapterCompletionPct(items, progressMap, 14)
  const ch19 = computeChapterCompletionPct(items, progressMap, 19)

  const hexagonTarget = Math.max(1, resolvedSummary.dimensions.length)
  const hexagonQualified = resolvedSummary.dimensions.filter(
    (d) => d.effectiveTotal > 0 && d.completionRate >= 20,
  ).length

  const goldenTarget = ch13STierTotal > 0 ? Math.min(5, ch13STierTotal) : 5

  return [
    makeBadge({
      id: 'first-patch',
      name: '初装补丁',
      description: '完成第 1 条人生补丁，迈出循证生活第一步',
      current: doneCount,
      target: 1,
    }),
    makeBadge({
      id: 'zero-cost-master',
      name: '零元购宗师',
      description: '完成 20 条「零花钱且不靠毅力」的高性价比补丁',
      current: zeroCostNoWillpowerDone,
      target: 20,
    }),
    makeBadge({
      id: 'clear-declutter',
      name: '清醒的断舍离',
      description: '主动标记 15 条「不适用」，只专注真正与你相关的事',
      current: skippedCount,
      target: 15,
    }),
    makeBadge({
      id: 'cyber-armor',
      name: '赛博金刚不坏',
      description: '第 14 章「账号与信息安全」有效完成率达到 80%',
      current: ch14.pct,
      target: 80,
      unlocked: ch14.effective > 0 && ch14.pct >= 80,
    }),
    makeBadge({
      id: 'golden-four-min',
      name: '黄金四分钟',
      description: '掌握第 13 章核心急救 S 级条目（至少 5 条）',
      current: ch13STierDone,
      target: goldenTarget,
      unlocked: ch13STierTotal > 0 && ch13STierDone >= goldenTarget,
    }),
    makeBadge({
      id: 'labor-law-dict',
      name: '劳动法活字典',
      description: '第 19 章「在职、离职和工伤」有效完成率达到 80%',
      current: ch19.pct,
      target: 80,
      unlocked: ch19.effective > 0 && ch19.pct >= 80,
    }),
    makeBadge({
      id: 'hexagon-warrior',
      name: '六边形战士',
      description: '六大人生维度完成率均达到 20% 及以上',
      current: hexagonQualified,
      target: hexagonTarget,
      unlocked: resolvedSummary.dimensions.length > 0 && hexagonQualified >= hexagonTarget,
    }),
    makeBadge({
      id: 's-tier-hunter',
      name: 'S 级猎手',
      description: '累计点亮 15 条 S 级黄金性价比补丁',
      current: sTierDone,
      target: 15,
    }),
    makeBadge({
      id: 'note-keeper',
      name: '循证记录官',
      description: '为至少 5 条建议写下本地私有落地笔记',
      current: notedCount,
      target: 5,
    }),
    makeBadge({
      id: 'annual-inspector',
      name: '年度巡检官',
      description: '为已完成补丁开启定期复检或完成一次巡检打卡',
      current: reviewConfiguredOrDone,
      target: 1,
    }),
  ]
}

import { computeScoreSummary } from '../shared/scoring.ts'
import { formatProfileContext } from '../shared/scenarios.ts'
import type { HowToLiveState, KnowledgeItemSummary } from '../shared/types.ts'
import type { KnowledgeStore } from './knowledge-store.ts'

/**
 * 生成《我的人生补丁配置单（Markdown）》导出文本，
 * 汇总个人画像、等级 XP、六维得分、待办行动清单与已完成 S 级补丁。
 */
export function buildPatchReportMarkdown(
  knowledge: KnowledgeStore,
  state: HowToLiveState,
  now = new Date(),
): string {
  const summary = computeScoreSummary(knowledge.allSummaries, state.progress, knowledge.meta.dimensions)
  const dateStr = now.toISOString().slice(0, 10)

  const plannedItems: KnowledgeItemSummary[] = []
  const doneSItems: KnowledgeItemSummary[] = []
  const doneOtherCountByDim = new Map<string, number>()

  for (const item of knowledge.allSummaries) {
    const status = state.progress[item.id]?.status ?? 'todo'
    if (status === 'planned') {
      plannedItems.push(item)
    } else if (status === 'done') {
      if (item.roiTier === 'S') {
        doneSItems.push(item)
      } else {
        doneOtherCountByDim.set(item.dimension, (doneOtherCountByDim.get(item.dimension) ?? 0) + 1)
      }
    }
  }

  const lines: string[] = [
    `# 我的人生补丁配置单（Life Patch Report）`,
    '',
    `> 导出日期：${dateStr}  |  当前等级：**Lv.${summary.level.level} ${summary.level.title}**（${summary.totalXp} XP）  |  总体完成率：**${summary.overallRate}%**（已完成 ${summary.doneCount} / 有效 ${summary.effectiveCount}，已标记不适用 ${summary.skippedCount}）`,
    '',
    '## 1. 六维属性评估',
    '',
    '| 维度 | 已完成 | 有效条目 | 行动清单 | 不适用 | 完成率 | 获得 XP |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...summary.dimensions.map(
      (d) => `| ${d.name} | ${d.done} | ${d.effectiveTotal} | ${d.planned} | ${d.skipped} | ${d.completionRate}% | ${d.earnedXp} |`,
    ),
    '',
    '## 2. 本地个人画像',
    '',
    formatProfileContext(state.profile)
      .split('\n')
      .map((l) => `- ${l}`)
      .join('\n'),
    '',
    `## 3. 近期行动清单（${plannedItems.length} 条）`,
    '',
  ]

  if (plannedItems.length === 0) {
    lines.push('暂无已加入行动清单的条目，可在插件面板中挑选高性价比补丁加入。')
  } else {
    for (const item of plannedItems) {
      const note = state.progress[item.id]?.note
      lines.push(`- [ ] **[${item.id}] ${item.title}**（${item.roiTier}级 · 证据${item.evidenceGrade || 'C'} · +${item.xp} XP）`)
      lines.push(`  - 成本：${item.cost || '见详情'}`)
      lines.push(`  - 说人话：${item.plain}`)
      if (note) lines.push(`  - 我的笔记：${note}`)
    }
  }

  lines.push('', `## 4. 已点亮的 S 级黄金补丁（${doneSItems.length} 条）`, '')
  if (doneSItems.length === 0) {
    lines.push('尚未点亮 S 级补丁，建议优先从「零花钱 + 不靠毅力」的 S 级建议开始。')
  } else {
    for (const item of doneSItems) {
      const note = state.progress[item.id]?.note
      lines.push(`- [x] **[${item.id}] ${item.title}**（${item.chapterTitle} · +${item.xp} XP）${note ? ` — _${note}_` : ''}`)
    }
  }

  lines.push(
    '',
    '---',
    '',
    `数据来源：[eternity4719/HowToLiveBetter](${knowledge.meta.upstream.url})${knowledge.meta.upstream.commitSha ? `（Commit \`${knowledge.meta.upstream.commitSha.slice(0, 7)}\`）` : ''}`,
    '注：医疗、法律及重大财务建议请结合自身实际情况与专业机构意见审慎决策。',
    '',
  )

  return lines.join('\n')
}

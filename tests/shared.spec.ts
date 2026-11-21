import { describe, expect, it } from 'vitest'
import {
  SCENARIOS,
  buildCheckupPrompt,
  buildItemActionPrompt,
  buildScenarioPrompt,
  computeLevelInfo,
  computeScoreSummary,
  DEFAULT_DIMENSIONS,
} from '../src/shared/index.ts'
import { en, zh } from '../src/client/locales.ts'
import type { ItemProgress, KnowledgeItemSummary } from '../src/shared/types.ts'

function makeItem(partial: Partial<KnowledgeItemSummary> & { id: string }): KnowledgeItemSummary {
  return {
    chapterNumber: 1,
    chapterTitle: '不要早死',
    number: 1,
    title: '测试条目',
    topic: null,
    dimension: 'survival',
    tags: { money: '0', time: '少', willpower: '否', benefit: '大', metric: '死亡率', audience: [], raw: '' },
    roiScore: 100,
    roiTier: 'S',
    xp: 40,
    plain: '说人话',
    cost: '0元',
    evidenceGrade: 'A',
    crossRefs: [],
    ...partial,
  }
}

describe('shared scoring & levels', () => {
  it('正确计算等级阈值与经验进度百分比', () => {
    expect(computeLevelInfo(0)).toMatchObject({ level: 1, title: '初装补丁', progressPct: 0 })
    expect(computeLevelInfo(50)).toMatchObject({ level: 1, nextLevelXp: 100, progressPct: 50 })
    expect(computeLevelInfo(100)).toMatchObject({ level: 2, title: '避坑学徒', nextLevelXp: 300, progressPct: 0 })
    expect(computeLevelInfo(15000)).toMatchObject({ level: 10, nextLevelXp: null, progressPct: 100 })
  })

  it('将 skipped 条目从完成率分母中剔除，并正确识别薄弱维度', () => {
    const items: KnowledgeItemSummary[] = [
      makeItem({ id: '01-01', dimension: 'survival', xp: 40 }),
      makeItem({ id: '01-02', dimension: 'survival', xp: 25 }),
      makeItem({ id: '01-03', dimension: 'survival', xp: 15 }),
      makeItem({ id: '05-01', dimension: 'wealth', chapterNumber: 5, xp: 40 }),
      makeItem({ id: '05-02', dimension: 'wealth', chapterNumber: 5, xp: 25 }),
    ]

    const progress: Record<string, ItemProgress> = {
      '01-01': { status: 'done', updatedAt: '2026-11-20T00:00:00Z' },
      '01-02': { status: 'skipped', updatedAt: '2026-11-20T00:00:00Z' },
      '05-01': { status: 'planned', updatedAt: '2026-11-20T00:00:00Z' },
    }

    const summary = computeScoreSummary(items, progress, DEFAULT_DIMENSIONS)
    expect(summary.totalXp).toBe(40)
    expect(summary.doneCount).toBe(1)
    expect(summary.skippedCount).toBe(1)
    expect(summary.plannedCount).toBe(1)
    expect(summary.effectiveCount).toBe(4)

    const survival = summary.dimensions.find((d) => d.id === 'survival')!
    expect(survival.effectiveTotal).toBe(2)
    expect(survival.completionRate).toBe(50)

    const wealth = summary.dimensions.find((d) => d.id === 'wealth')!
    expect(wealth.effectiveTotal).toBe(2)
    expect(wealth.completionRate).toBe(0)
    expect(summary.weakestDimension?.id).toBe('wealth')
  })

  it('生成包含画像与安全边界的 AI 体检和情景急救 Prompt', () => {
    const prompt = buildCheckupPrompt({ occupation: 'programmer', housing: 'renting' })
    expect(prompt).toContain('程序员')
    expect(prompt).toContain('租房中')
    expect(prompt).toContain('howtolive_search')
    expect(prompt).toContain('evidenceGrade')

    expect(SCENARIOS).toHaveLength(6)
    const scenarioPrompt = buildScenarioPrompt(SCENARIOS[0]!, { ageGroup: '26-35' })
    expect(scenarioPrompt).toContain('裁员')
    expect(scenarioPrompt).toContain('26-35 岁')
    expect(scenarioPrompt).toContain('howtolive_get_item')

    const itemPrompt = buildItemActionPrompt(makeItem({ id: '14-01', title: '开启两步验证' }), {
      occupation: 'programmer',
    })
    expect(itemPrompt).toContain('14-01')
    expect(itemPrompt).toContain('开启两步验证')
    expect(itemPrompt).toContain('程序员')
    expect(itemPrompt).toContain('howtolive_get_item')
  })

  it('双语词典 zh 与 en 键完全对齐且无空值', () => {
    const zhKeys = Object.keys(zh).sort()
    const enKeys = Object.keys(en).sort()
    expect(enKeys).toEqual(zhKeys)
    for (const k of zhKeys) {
      expect(zh[k as keyof typeof zh].trim().length).toBeGreaterThan(0)
      expect(en[k as keyof typeof en].trim().length).toBeGreaterThan(0)
    }
  })
})

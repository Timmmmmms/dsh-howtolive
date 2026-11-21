import { describe, expect, it } from 'vitest'
import {
  SCENARIOS,
  buildChaosDrillPrompt,
  buildCheckupPrompt,
  buildItemActionPrompt,
  buildScenarioPrompt,
  buildSprintDeck,
  computeLevelInfo,
  computeScoreSummary,
  countSprintModeAvailability,
  DEFAULT_DIMENSIONS,
  formatLifeCveId,
  scanLifeVulnerabilities,
  selectChaosDrillCandidates,
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

  it('Task 1A：selectChaosDrillCandidates 挑选未完成 S/A 暗雷并生成防坑演练 Prompt', () => {
    const items: KnowledgeItemSummary[] = [
      makeItem({ id: '01-01', dimension: 'survival', roiTier: 'S', title: '安全带' }),
      makeItem({ id: '05-01', chapterNumber: 5, dimension: 'wealth', roiTier: 'S', title: '应急资金' }),
      makeItem({ id: '14-02', chapterNumber: 14, number: 2, dimension: 'resilience', roiTier: 'S', title: '两步验证' }),
      makeItem({ id: '19-01', chapterNumber: 19, dimension: 'career', roiTier: 'A', title: '留存考勤证据' }),
      makeItem({ id: '01-02', number: 2, dimension: 'survival', roiTier: 'S', title: '已完成条目' }),
    ]
    const progress: Record<string, ItemProgress> = {
      '01-02': { status: 'done', updatedAt: '2026-11-21T00:00:00Z' },
    }
    const candidates = selectChaosDrillCandidates(items, progress, { occupation: 'programmer' }, 4)
    expect(candidates).toHaveLength(4)
    expect(candidates.some((c) => c.id === '01-02')).toBe(false)
    // 程序员画像优先提升第 14 章安全条目
    expect(candidates[0]!.id).toBe('14-02')

    const summary = computeScoreSummary(items, progress, DEFAULT_DIMENSIONS)
    const prompt = buildChaosDrillPrompt({ occupation: 'programmer' }, summary, candidates)
    expect(prompt).toContain('墨菲定律考官')
    expect(prompt).toContain('严禁剧透')
    expect(prompt).toContain('howtolive_get_item')
    expect(prompt).toContain('[14-02]')
    expect(prompt).toContain('4 轮')

    // 空候选时兜底引导模型调用 howtolive_search
    const fallbackPrompt = buildChaosDrillPrompt({}, undefined, [])
    expect(fallbackPrompt).toContain('howtolive_search')
  })

  it('Task 1B：scanLifeVulnerabilities 确定性分级、格式化 CVE ID 并随修复响应安全状态', () => {
    expect(formatLifeCveId({ chapterNumber: 14, number: 2 })).toBe('LIFE-CVE-14-02')

    const items: KnowledgeItemSummary[] = [
      makeItem({
        id: '14-02',
        chapterNumber: 14,
        number: 2,
        dimension: 'resilience',
        roiTier: 'S',
        tags: { money: '0', time: '少', willpower: '否', benefit: '大', metric: '', audience: [], raw: '' },
      }),
      makeItem({
        id: '15-03',
        chapterNumber: 15,
        number: 3,
        dimension: 'wealth',
        roiTier: 'A',
        evidenceGrade: 'B',
        tags: { money: '中', time: '少', willpower: '否', benefit: '大', metric: '', audience: [], raw: '' },
      }),
      makeItem({
        id: '01-05',
        chapterNumber: 1,
        number: 5,
        dimension: 'survival',
        roiTier: 'C',
        evidenceGrade: 'C',
      }),
    ]

    // 租房画像让第 15 章的 A 级条目升级为 HIGH 漏洞；C 级条目不报漏洞
    const exposed = scanLifeVulnerabilities(items, {}, { housing: 'renting' })
    expect(exposed.status).toBe('Exposed')
    expect(exposed.criticalCount).toBe(1)
    expect(exposed.highCount).toBe(1)
    expect(exposed.hardeningRate).toBe(0)
    expect(exposed.vulnerabilities[0]!.cveId).toBe('LIFE-CVE-14-02')
    expect(exposed.vulnerabilities[0]!.severity).toBe('CRITICAL')
    expect(exposed.vulnerabilities[1]!.cveId).toBe('LIFE-CVE-15-03')
    expect(exposed.vulnerabilities[1]!.severity).toBe('HIGH')

    // 修复 CRITICAL 后进入 Guarded
    const guarded = scanLifeVulnerabilities(
      items,
      { '14-02': { status: 'done', updatedAt: '2026-11-21T00:00:00Z' } },
      { housing: 'renting' },
    )
    expect(guarded.criticalCount).toBe(0)
    expect(guarded.highCount).toBe(1)
    expect(guarded.hardeningRate).toBe(50)
    expect(guarded.status).toBe('Guarded')

    // 全部修复后进入 Hardened
    const hardened = scanLifeVulnerabilities(
      items,
      {
        '14-02': { status: 'done', updatedAt: '2026-11-21T00:00:00Z' },
        '15-03': { status: 'done', updatedAt: '2026-11-21T00:00:00Z' },
      },
      { housing: 'renting' },
    )
    expect(hardened.criticalCount).toBe(0)
    expect(hardened.highCount).toBe(0)
    expect(hardened.hardeningRate).toBe(100)
    expect(hardened.status).toBe('Hardened')
  })

  it('Task 1C：buildSprintDeck 与 countSprintModeAvailability 正确构建 3 种速刷卡池', () => {
    const items: KnowledgeItemSummary[] = [
      makeItem({
        id: '01-01',
        dimension: 'survival',
        roiTier: 'S',
        tags: { money: '0', time: '0', willpower: '否', benefit: '大', metric: '', audience: [], raw: '' },
      }),
      makeItem({
        id: '05-01',
        chapterNumber: 5,
        dimension: 'wealth',
        roiTier: 'A',
        tags: { money: '少', time: '少', willpower: '是', benefit: '大', metric: '', audience: [], raw: '' },
      }),
      makeItem({
        id: '05-02',
        chapterNumber: 5,
        number: 2,
        dimension: 'wealth',
        roiTier: 'S',
        tags: { money: '0', time: '少', willpower: '是', benefit: '大', metric: '', audience: [], raw: '' },
      }),
    ]
    const progress: Record<string, ItemProgress> = {
      '01-01': { status: 'done', updatedAt: '2026-11-21T00:00:00Z' },
      '05-01': { status: 'planned', updatedAt: '2026-11-21T00:00:00Z' },
    }
    const summary = computeScoreSummary(items, progress, DEFAULT_DIMENSIONS)
    const counts = countSprintModeAvailability(items, progress, summary)
    expect(counts).toEqual({ zeroCost: 1, weakest: 2, planned: 1 })

    const zeroDeck = buildSprintDeck({ mode: 'zeroCost', items, progress, summary })
    expect(zeroDeck.map((i) => i.id)).toEqual(['05-02'])

    const weakestDeck = buildSprintDeck({ mode: 'weakest', items, progress, summary })
    expect(weakestDeck.map((i) => i.id)).toEqual(['05-02', '05-01'])

    const plannedDeck = buildSprintDeck({ mode: 'planned', items, progress, summary })
    expect(plannedDeck.map((i) => i.id)).toEqual(['05-01'])
  })
})

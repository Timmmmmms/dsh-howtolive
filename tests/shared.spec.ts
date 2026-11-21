import { describe, expect, it } from 'vitest'
import {
  SCENARIOS,
  buildChaosDrillPrompt,
  buildCheckupPrompt,
  buildItemActionPrompt,
  buildLifeOsCardSvg,
  buildPatchGraph,
  buildScenarioPrompt,
  buildSprintDeck,
  buildWeekendPlanPrompt,
  computeBadges,
  computeLevelInfo,
  computeLifeOsProfile,
  computeScoreSummary,
  countDueReviewItems,
  countSprintModeAvailability,
  DEFAULT_DIMENSIONS,
  findProfileSkipCandidates,
  formatLifeCveId,
  getItemNextReviewDate,
  getRecommendedReviewInterval,
  isItemDueForReview,
  resolveLifeOsArchetypeKey,
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

  it('Task 2A：computeBadges 正确计算 10 枚成就徽章及边界条件', () => {
    // 1. 空进度时全部未解锁
    const emptyBadges = computeBadges([], {})
    expect(emptyBadges).toHaveLength(10)
    expect(emptyBadges.every((b) => !b.unlocked)).toBe(true)

    // 2. 构造覆盖多维度、章节 13/14/19、零成本、skipped、笔记与复检的数据集
    const items: KnowledgeItemSummary[] = []
    const progress: Record<string, ItemProgress> = {}
    const now = '2026-11-21T00:00:00Z'

    // 20 条零花钱不靠毅力 S 级（同时覆盖第 13 章 5 条 S 级急救）
    for (let i = 1; i <= 20; i++) {
      const ch = i <= 5 ? 13 : 1
      const id = `${String(ch).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      items.push(makeItem({
        id,
        chapterNumber: ch,
        number: i,
        dimension: 'survival',
        roiTier: 'S',
        tags: { money: '0', time: '0', willpower: '否', benefit: '大', metric: '', audience: [], raw: '' },
      }))
      progress[id] = {
        status: 'done',
        ...(i <= 5 ? { note: `笔记 ${i}` } : {}),
        ...(i === 1 ? { reviewIntervalDays: 180, lastReviewedAt: now } : {}),
        updatedAt: now,
      }
    }

    // 15 条 skipped
    for (let i = 1; i <= 15; i++) {
      const id = `05-${String(i).padStart(2, '0')}`
      items.push(makeItem({ id, chapterNumber: 5, number: i, dimension: 'wealth', roiTier: 'B' }))
      progress[id] = { status: 'skipped', updatedAt: now }
    }

    // 第 14 章 5 条：4 条 done + 1 条 skipped => 有效完成率 100% >= 80%
    for (let i = 1; i <= 5; i++) {
      const id = `14-${String(i).padStart(2, '0')}`
      items.push(makeItem({ id, chapterNumber: 14, number: i, dimension: 'resilience', roiTier: 'A' }))
      progress[id] = { status: i <= 4 ? 'done' : 'skipped', updatedAt: now }
    }

    // 第 19 章 5 条：4 条 done + 1 条 todo => 80%
    for (let i = 1; i <= 5; i++) {
      const id = `19-${String(i).padStart(2, '0')}`
      items.push(makeItem({ id, chapterNumber: 19, number: i, dimension: 'career', roiTier: 'A' }))
      if (i <= 4) progress[id] = { status: 'done', updatedAt: now }
    }

    // 补齐其余维度（wealth / legal / family）各 1 条 done 达标 >= 20%
    const extraDims: Array<{ id: string; ch: number; dim: KnowledgeItemSummary['dimension'] }> = [
      { id: '05-99', ch: 5, dim: 'wealth' },
      { id: '08-01', ch: 8, dim: 'legal' },
      { id: '10-01', ch: 10, dim: 'family' },
    ]
    for (const d of extraDims) {
      items.push(makeItem({ id: d.id, chapterNumber: d.ch, dimension: d.dim }))
      progress[d.id] = { status: 'done', updatedAt: now }
    }

    const badges = computeBadges(items, progress)
    const byId = Object.fromEntries(badges.map((b) => [b.id, b]))

    expect(byId['first-patch']?.unlocked).toBe(true)
    expect(byId['zero-cost-master']?.unlocked).toBe(true)
    expect(byId['clear-declutter']?.unlocked).toBe(true)
    expect(byId['cyber-armor']?.unlocked).toBe(true)
    expect(byId['golden-four-min']?.unlocked).toBe(true)
    expect(byId['labor-law-dict']?.unlocked).toBe(true)
    expect(byId['hexagon-warrior']?.unlocked).toBe(true)
    expect(byId['s-tier-hunter']?.unlocked).toBe(true)
    expect(byId['note-keeper']?.unlocked).toBe(true)
    expect(byId['annual-inspector']?.unlocked).toBe(true)
  })

  it('Task 2B：computeLifeOsProfile 与 buildLifeOsCardSvg 严格脱敏且生成自包含 SVG', () => {
    const items: KnowledgeItemSummary[] = [
      makeItem({ id: '01-01', dimension: 'survival', roiTier: 'S', xp: 40 }),
      makeItem({ id: '01-02', number: 2, dimension: 'survival', roiTier: 'S', xp: 40 }),
      makeItem({ id: '05-01', chapterNumber: 5, dimension: 'wealth', roiTier: 'B', xp: 15 }),
    ]
    const progress: Record<string, ItemProgress> = {
      '01-01': { status: 'done', note: '绝对不能泄露的私密笔记12345', updatedAt: '2026-11-21T00:00:00Z' },
      '01-02': { status: 'done', updatedAt: '2026-11-21T00:00:00Z' },
    }
    const summary = computeScoreSummary(items, progress, DEFAULT_DIMENSIONS)
    const osProfile = computeLifeOsProfile(summary, items, progress, {
      occupation: 'programmer',
      customNote: '绝对不能泄露的个人画像备注XYZ',
    })

    expect(osProfile.version).toMatch(/^LifeOS v\d+\.\d+\.\d+-(lts|stable|beta)$/)
    expect(resolveLifeOsArchetypeKey(summary)).toBe('longevity-monk')
    expect(osProfile.featuredBadges.some((b) => b.id === 'first-patch')).toBe(true)

    const serialized = JSON.stringify(osProfile)
    expect(serialized).not.toContain('私密笔记12345')
    expect(serialized).not.toContain('个人画像备注XYZ')

    const svg = buildLifeOsCardSvg(osProfile, {
      theme: 'dark',
      archetypeTitle: '长命百岁月光族 <Test & Co>',
      archetypeTagline: '生命防线拉满',
      securityLabel: 'Hardened',
      coverageLabel: '总体覆盖率',
      levelLabel: 'Lv.1 初装补丁 · 80 XP',
      badgesTitle: '代表徽章',
      noBadgesLabel: '暂无徽章',
      watermark: 'HowToLiveBetter',
    })

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('&lt;Test &amp; Co&gt;')
    expect(svg).not.toContain('var(--dsw-')
    expect(svg).not.toContain('私密笔记12345')
  })

  it('Task 2C：isItemDueForReview 与 countDueReviewItems 正确处理时区、闰年、旧数据且不扣除 XP', () => {
    // 未设置复检周期（旧版 state.json）永不到期
    expect(isItemDueForReview({ status: 'done', updatedAt: '2020-01-01T00:00:00Z' }, '2026-11-21T00:00:00Z')).toBe(false)
    // 非 done 状态即使有 reviewIntervalDays 也不触发到期
    expect(
      isItemDueForReview(
        { status: 'planned', reviewIntervalDays: 90, updatedAt: '2020-01-01T00:00:00Z' },
        '2026-11-21T00:00:00Z',
      ),
    ).toBe(false)

    // 闰年精确天数边界（2024 年 2 月有 29 天，1 月 1 日 + 90 天 = 2024-03-31T00:00:00Z）
    const leapProgress: ItemProgress = {
      status: 'done',
      reviewIntervalDays: 90,
      lastReviewedAt: '2024-01-01T08:00:00+08:00', // 等价 2024-01-01T00:00:00Z
      updatedAt: '2024-01-01T00:00:00Z',
    }
    expect(getItemNextReviewDate(leapProgress)?.toISOString()).toBe('2024-03-31T00:00:00.000Z')
    expect(isItemDueForReview(leapProgress, '2024-03-30T23:59:59Z')).toBe(false)
    expect(isItemDueForReview(leapProgress, '2024-03-31T00:00:00Z')).toBe(true)

    // 推荐周期映射表与关键词启发式
    expect(getRecommendedReviewInterval(makeItem({ id: '01-26', title: '灭火器' }))).toBe(365)
    expect(getRecommendedReviewInterval(makeItem({ id: '14-02', chapterNumber: 14, title: '两步验证' }))).toBe(180)

    // 到期条目计入 dueReviewCount，但绝不扣除已获 XP
    const items = [makeItem({ id: '01-26', xp: 40 })]
    const progress: Record<string, ItemProgress> = { '01-26': leapProgress }
    expect(countDueReviewItems(items, progress, '2024-04-01T00:00:00Z')).toBe(1)
    const summary = computeScoreSummary(items, progress, DEFAULT_DIMENSIONS, '2024-04-01T00:00:00Z')
    expect(summary.dueReviewCount).toBe(1)
    expect(summary.totalXp).toBe(40)
  })

  it('Task 3A：buildPatchGraph 确定性计算六维放射星图，默认过滤孤立节点并支持单维度展开', () => {
    const items: KnowledgeItemSummary[] = [
      makeItem({ id: '01-01', dimension: 'survival', roiTier: 'S', crossRefs: ['05-01', '01-01', '99-99'] }),
      makeItem({ id: '05-01', dimension: 'wealth', chapterNumber: 5, roiTier: 'A', crossRefs: ['14-01'] }),
      makeItem({ id: '14-01', dimension: 'resilience', chapterNumber: 14, roiTier: 'S', crossRefs: [] }),
      makeItem({ id: '09-01', dimension: 'legal', chapterNumber: 9, roiTier: 'B', crossRefs: [] }), // 孤立节点
    ]
    const progress: Record<string, ItemProgress> = {
      '01-01': { status: 'done', updatedAt: '2026-11-21T00:00:00Z' },
      '05-01': { status: 'done', updatedAt: '2026-11-21T00:00:00Z' },
    }

    const g1 = buildPatchGraph(items, progress)
    const g2 = buildPatchGraph(items, progress)

    // 确定性：相同输入产出完全一致的坐标与边
    expect(g1.nodes).toEqual(g2.nodes)
    expect(g1.edges).toEqual(g2.edges)
    // 默认 core 模式仅展示参与关联的 3 个节点，跳过自环与不存在的 99-99
    expect(g1.mode).toBe('core')
    expect(g1.nodes.map((n) => n.id).sort()).toEqual(['01-01', '05-01', '14-01'])
    expect(g1.isolatedCount).toBe(1)
    expect(g1.edges).toHaveLength(2)
    expect(g1.edges.find((e) => e.id === '01-01->05-01')?.bothDone).toBe(true)
    expect(g1.edges.find((e) => e.id === '01-01->05-01')?.crossDimension).toBe(true)

    // includeIsolated: true 包含孤立节点
    const gAll = buildPatchGraph(items, progress, { includeIsolated: true })
    expect(gAll.mode).toBe('all')
    expect(gAll.nodes).toHaveLength(4)

    // 单维度模式只展示对应扇区
    const gSingle = buildPatchGraph(
      items.filter((i) => i.dimension === 'legal'),
      progress,
      { dimension: 'legal' },
    )
    expect(gSingle.sectors).toHaveLength(1)
    expect(gSingle.sectors[0]?.dimension).toBe('legal')
    expect(gSingle.nodes).toHaveLength(1)
  })

  it('Task 3B：findProfileSkipCandidates 按画像保守识别不适用 todo 条目且绝不触碰已处理条目', () => {
    const items: KnowledgeItemSummary[] = [
      makeItem({ id: '27-01', chapterNumber: 27, dimension: 'family', title: '孕期产检', tags: { money: '少', time: '少', willpower: '否', benefit: '大', metric: '', audience: ['怀孕'], raw: '' } }),
      makeItem({ id: '20-01', chapterNumber: 20, dimension: 'family', title: '新生儿黄疸', tags: { money: '0', time: '少', willpower: '否', benefit: '大', metric: '', audience: ['婴幼儿'], raw: '' } }),
      makeItem({ id: '11-01', chapterNumber: 11, dimension: 'legal', title: '爬虫法律红线' }),
      makeItem({ id: '15-01', chapterNumber: 15, dimension: 'wealth', title: '租房退租押金维权' }),
      makeItem({ id: '15-02', chapterNumber: 15, dimension: 'wealth', title: '买房验房清单' }),
      makeItem({ id: '01-01', chapterNumber: 1, dimension: 'survival', title: '安全带' }),
      // 已被用户标记为 planned 的条目绝不进入筛查候选
      makeItem({ id: '27-02', chapterNumber: 27, dimension: 'family', title: '孕期营养' }),
    ]

    const progress: Record<string, ItemProgress> = {
      '27-02': { status: 'planned', updatedAt: '2026-11-21T00:00:00Z' },
    }

    const analysis = findProfileSkipCandidates(items, progress, {
      ageGroup: '26-35',
      occupation: 'office',
      housing: 'owned',
      family: ['single'],
    })

    const candidateIds = analysis.candidates.map((c) => c.item.id).sort()
    expect(candidateIds).toEqual(['11-01', '15-01', '20-01', '27-01'])
    expect(candidateIds).not.toContain('27-02')
    expect(candidateIds).not.toContain('15-02')
    expect(candidateIds).not.toContain('01-01')
    expect(analysis.groups.map((g) => g.reasonId)).toEqual([
      'notPregnant',
      'noInfant',
      'notDeveloper',
      'notRenting',
    ])
  })

  it('Task 3B：buildWeekendPlanPrompt 生成包含成本/耗时标签与画像的周末行动时间表提示词', () => {
    const planned: KnowledgeItemSummary[] = [
      makeItem({
        id: '14-01',
        chapterNumber: 14,
        title: '为重要账号开启两步验证',
        roiTier: 'S',
        tags: { money: '0', time: '少', willpower: '否', benefit: '大', metric: '', audience: [], raw: '' },
      }),
      makeItem({
        id: '01-26',
        chapterNumber: 1,
        title: '家里备齐灭火器',
        roiTier: 'A',
        tags: { money: '少', time: '少', willpower: '否', benefit: '大', metric: '', audience: [], raw: '' },
      }),
    ]

    const prompt = buildWeekendPlanPrompt(planned, { occupation: 'programmer', housing: 'renting' })
    expect(prompt).toContain('14-01')
    expect(prompt).toContain('01-26')
    expect(prompt).toContain('花钱:0')
    expect(prompt).toContain('耗时:少')
    expect(prompt).toContain('程序员')
    expect(prompt).toContain('周六上午')
    expect(prompt).toContain('howtolive_get_item')
  })
})

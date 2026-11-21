import { computeProfileMatchScore } from './cve.ts'
import type {
  ItemProgress,
  ItemStatus,
  KnowledgeItem,
  KnowledgeItemSummary,
  RoiTier,
  ScenarioPreset,
  ScoreSummary,
  UserProfile,
} from './types.ts'

/**
 * 6 大「遇事不慌」情景急救箱预设，严格对应 DESIGN_AND_PLAN.md 章节映射。
 */
export const SCENARIOS: readonly ScenarioPreset[] = [
  {
    id: 'layoff',
    icon: '💼',
    title: '裁员 / N+1 / 劳资纠纷',
    subtitle: '证据保留、离职赔偿谈判、社保与工伤红线',
    chapters: [19, 9, 8],
    keywords: ['裁员', '辞退', 'N+1', '劳动仲裁', '工伤', '社保', '合同'],
    urgentTip: '切勿在未确认赔偿清单前签署「主动离职」或空白协议，先保留考勤、沟通与薪资流水。',
  },
  {
    id: 'medical',
    icon: '🏥',
    title: '突发急救 / 看病防坑',
    subtitle: '紧急处置、急诊沟通、循证用药与检查避坑',
    chapters: [13, 24, 34],
    keywords: ['急救', '120', '医院', '急诊', '用药', '症状', '过敏'],
    urgentTip: '若出现胸痛、呼吸困难、意识丧失、大出血或疑似卒中，请立即拨打 120 或前往最近急诊。',
  },
  {
    id: 'housing',
    icon: '🏠',
    title: '租房 / 买房避坑',
    subtitle: '押金维权、房屋体检、合同陷阱与隐性支出',
    chapters: [15, 5, 9],
    keywords: ['租房', '买房', '押金', '房东', '中介', '合同', '甲醛'],
    urgentTip: '入住与退租务必全程录像留存水电表与房屋现状，任何口头承诺写入书面补充条款。',
  },
  {
    id: 'developer',
    icon: '💻',
    title: '程序员合规 / 独立开发红线',
    subtitle: '技术人法律底线、建站备案、开源合规与账号安全',
    chapters: [11, 26, 12, 14],
    keywords: ['爬虫', '接口', '开源', '副业', '网站', '备案', '版权', '隐私'],
    urgentTip: '切勿触碰未授权渗透、绕过付费墙/反爬批量抓取个人隐私数据及无资质代收代付。',
  },
  {
    id: 'security',
    icon: '🛡️',
    title: '账号安全 / 遭遇诈骗或胁迫',
    subtitle: '账号止损、反诈冻结、取证报案与个人防身',
    chapters: [14, 8, 9],
    keywords: ['诈骗', '盗号', '勒索', '报警', '密码', '二次验证', '冻结'],
    urgentTip: '涉及资金被骗第一时间拨打 110 / 96110 并联系银行挂失止付，切勿删除聊天与转账记录。',
  },
  {
    id: 'recovery',
    icon: '🌧️',
    title: '低谷 / 失业 / 重大打击',
    subtitle: '财务止血、情绪急救、低成本生活与重启路径',
    chapters: [7, 29, 22],
    keywords: ['失业', '低谷', '压力', '抑郁', '省钱', '负债', '休息'],
    urgentTip: '先止血再规划：停掉非必要刚性支出，盘点现金流安全垫，允许自己先恢复睡眠与节律。',
  },
]

/** 将用户画像格式化为可读中文上下文 */
export function formatProfileContext(profile: UserProfile): string {
  const parts: string[] = []
  const ageMap: Record<NonNullable<UserProfile['ageGroup']>, string> = {
    '18-25': '18-25 岁',
    '26-35': '26-35 岁',
    '36-45': '36-45 岁',
    '46-60': '46-60 岁',
    '60+': '60 岁以上',
  }
  const jobMap: Record<NonNullable<UserProfile['occupation']>, string> = {
    programmer: '程序员 / 技术从业者',
    office: '普通上班族',
    freelance: '自由职业 / 独立开发',
    business: '创业 / 个体经营',
    student: '在校学生',
    other: '其他职业',
  }
  const housingMap: Record<NonNullable<UserProfile['housing']>, string> = {
    renting: '租房中',
    buying: '准备买房 / 贷款中',
    owned: '自有住房',
    family: '与家人同住',
  }
  const familyMap: Record<string, string> = {
    single: '单身',
    partner: '有伴侣 / 已婚',
    pregnant: '备孕 / 孕期',
    infant: '家有婴幼儿',
    child: '家有学龄孩子',
    elderly: '需要照顾老人',
  }
  const goalMap: Record<string, string> = {
    health: '生命防线与健康',
    money: '省钱攒钱与防坑',
    legal: '法律合规与维权',
    career: '职场效率与规划',
    family: '家庭与亲子养老',
    security: '信息安全与心理韧性',
  }

  if (profile.ageGroup) parts.push(`年龄段：${ageMap[profile.ageGroup]}`)
  if (profile.occupation) parts.push(`职业特征：${jobMap[profile.occupation]}`)
  if (profile.housing) parts.push(`居住情况：${housingMap[profile.housing]}`)
  if (profile.family && profile.family.length > 0) {
    parts.push(`家庭情况：${profile.family.map((f) => familyMap[f] ?? f).join('、')}`)
  }
  if (profile.goals && profile.goals.length > 0) {
    parts.push(`当前重点关注：${profile.goals.map((g) => goalMap[g] ?? g).join('、')}`)
  }
  if (profile.customNote?.trim()) {
    parts.push(`补充说明：${profile.customNote.trim()}`)
  }
  return parts.length > 0 ? parts.join('\n') : '暂未填写详细画像（请先结合全库零成本 S/A 级核心建议，或礼貌询问关键情况）。'
}

/**
 * 构造「AI 人生体检」自动发送提示词，包含用户画像与循证边界约束。
 */
export function buildCheckupPrompt(profile: UserProfile, summary?: ScoreSummary): string {
  const profileText = formatProfileContext(profile)
  const summaryLines = summary
    ? [
        `当前补丁等级：Lv.${summary.level.level} ${summary.level.title}（${summary.totalXp} XP）`,
        `总体进度：已完成 ${summary.doneCount}/${summary.effectiveCount} 条（已跳过 ${summary.skippedCount} 条，待办清单 ${summary.plannedCount} 条）`,
        `各维度完成率：${summary.dimensions.map((d) => `${d.name} ${d.completionRate}%`).join('；')}`,
        summary.weakestDimension ? `当前最薄弱维度：${summary.weakestDimension.name}（${summary.weakestDimension.completionRate}%）` : '',
      ].filter(Boolean).join('\n')
    : ''

  return [
    '请以「AI 人生体检官」的身份，调用 `howtolive_get_summary`、`howtolive_search` 和 `howtolive_get_item` 工具，结合我本地的个人画像与执行进度，为我输出一份【当前花最少代价、收益最大的 Top 5 人生补丁】行动建议。',
    '',
    '### 我的本地个人画像',
    profileText,
    summaryLines ? `\n### 当前六维仪表盘概况\n${summaryLines}` : '',
    '',
    '### 回答要求',
    '1. **必须先调用插件工具检索**，不要凭记忆编造条目编号或内容；优先从我尚未完成（`excludeDone: true`）且符合我画像的 S/A 级高性价比条目中挑选。',
    '2. 每条推荐请明确列出：**条目 ID 与标题**、**性价比分级与成本**、**为什么现在最适合我**、**今天就能落地的第一步**。',
    '3. 若涉及医疗、法律或重大财务决策，必须如实引用原书标注的 `evidenceGrade`（证据等级）与 `sources`（来源依据），严禁编造法条或医疗剂量；遇到紧急身体危险提示立即拨打 120 或就医。',
  ].filter(Boolean).join('\n')
}

/**
 * 构造「情景急救箱」自动发送提示词。
 */
export function buildScenarioPrompt(scenario: ScenarioPreset, profile: UserProfile): string {
  const profileText = formatProfileContext(profile)
  return [
    `我当前面临情景：【${scenario.title}】（${scenario.subtitle}）。`,
    `请立即调用 \`howtolive_search\`（优先检索第 ${scenario.chapters.join('、')} 节及相关关键词：${scenario.keywords.join('、')}）和 \`howtolive_get_item\` 获取原书循证条目原文，带我一步步稳住局面、算清代价与风险，并列出可立刻执行的核查/取证清单。`,
    '',
    '### 我的本地画像背景',
    profileText,
    '',
    '### 安全与循证红线',
    `- ${scenario.urgentTip}`,
    '- 请优先引用原书的 `evidenceGrade`（证据等级）、`sources`（来源/法规/研究依据）与 `notes`（操作细节），绝不编造不存在的法条、赔偿标准或医疗剂量。',
    '- 若发现属于人身安全、重大急性疾病或正在发生的电信诈骗，请在回复最开头显著提示立即拨打 120 / 110 / 96110 或寻求现场专业帮助。',
  ].join('\n')
}

/**
 * 构造单条建议「问 AI 怎么落地」的定制执行提示词。
 */
export function buildItemActionPrompt(
  item: KnowledgeItemSummary | KnowledgeItem,
  profile: UserProfile,
): string {
  const profileText = formatProfileContext(profile)
  const extraBenefit = 'benefit' in item && item.benefit ? `收益/代价：${item.benefit}` : ''
  const extraNotes = 'notes' in item && item.notes ? `原书操作备注：${item.notes}` : ''

  return [
    `请帮我制定【[${item.id}] ${item.title}】的个人落地执行方案，先调用 \`howtolive_get_item\`（id: "${item.id}"）核对完整原文与交叉引用。`,
    '',
    '### 条目摘要',
    `- 所属章节：第 ${item.chapterNumber} 章 ${item.chapterTitle}`,
    `- 性价比与证据：${item.roiTier} 级 · 证据 ${item.evidenceGrade || 'C'} · 成本：${item.cost || '见详情'}`,
    `- 说人话：${item.plain}`,
    extraBenefit ? `- ${extraBenefit}` : '',
    extraNotes ? `- ${extraNotes}` : '',
    '',
    '### 我的本地个人画像',
    profileText,
    '',
    '### 回答要求',
    '1. 结合我的个人画像，拆解成 3~5 个清晰、低阻力、本周即可完成的具体行动步骤。',
    '2. 标出常见踩坑点、需要提前准备的材料/工具，以及如何低成本验证是否落实到位。',
    '3. 若涉及医疗、法律或财务决策，请忠实引用原书 `evidenceGrade` 与 `sources`，不编造数据或法条。',
  ].filter(Boolean).join('\n')
}

const DRILL_TIER_RANK: Record<RoiTier, number> = { S: 0, A: 1, B: 2, C: 3 }

/**
 * 从未完成的 S/A 级高匹配条目中挑选 3~5 条作为「防坑演练场」的暗雷候选。
 * 优先覆盖不同人生维度，确保每场压力测试场景丰富且切合本地画像。
 */
export function selectChaosDrillCandidates(
  items: readonly KnowledgeItemSummary[],
  progress: Readonly<Record<string, ItemProgress | undefined>>,
  profile: UserProfile,
  count = 4,
): KnowledgeItemSummary[] {
  const targetCount = Math.max(3, Math.min(5, count))

  const isUnfinished = (item: KnowledgeItemSummary): boolean => {
    const st: ItemStatus = progress[item.id]?.status ?? 'todo'
    return st === 'todo' || st === 'planned'
  }

  const rank = (a: KnowledgeItemSummary, b: KnowledgeItemSummary): number => {
    const scoreA = a.roiScore + computeProfileMatchScore(a, profile) + (a.tags?.money === '0' ? 10 : 0)
    const scoreB = b.roiScore + computeProfileMatchScore(b, profile) + (b.tags?.money === '0' ? 10 : 0)
    return (
      DRILL_TIER_RANK[a.roiTier] - DRILL_TIER_RANK[b.roiTier]
      || scoreB - scoreA
      || a.chapterNumber - b.chapterNumber
      || a.number - b.number
    )
  }

  const saPool = items
    .filter((item) => isUnfinished(item) && (item.roiTier === 'S' || item.roiTier === 'A'))
    .sort(rank)

  const fallbackPool = saPool.length >= targetCount
    ? saPool
    : [
        ...saPool,
        ...items
          .filter((item) => isUnfinished(item) && item.roiTier !== 'S' && item.roiTier !== 'A')
          .sort(rank),
      ]

  const picked: KnowledgeItemSummary[] = []
  const usedDims = new Set<string>()
  const usedIds = new Set<string>()

  // 第一轮：优先每个维度最多挑 1 条，增加突发事件的多样性
  for (const item of fallbackPool) {
    if (picked.length >= targetCount) break
    if (usedDims.has(item.dimension)) continue
    picked.push(item)
    usedDims.add(item.dimension)
    usedIds.add(item.id)
  }

  // 第二轮：若不足 targetCount，再按排序补足
  for (const item of fallbackPool) {
    if (picked.length >= targetCount) break
    if (usedIds.has(item.id)) continue
    picked.push(item)
    usedIds.add(item.id)
  }

  return picked
}

/**
 * 构造「人生混沌工程 · 防坑演练场」AI 文字 RPG 提示词：
 * - 从用户未完成的 S/A 级高匹配条目中埋入 3~5 条“暗雷”
 * - 指示 DeepSeek 扮演「墨菲定律考官」发起 3~4 轮沉浸式突发危机演练（每轮严禁剧透答案）
 * - 演练结束时强制调用 `howtolive_get_item` 核验原书条目，输出生存评分与复盘，自然触发 TurnPatchCard
 */
export function buildChaosDrillPrompt(
  profile: UserProfile,
  summary: ScoreSummary | undefined,
  candidateItems: readonly KnowledgeItemSummary[],
): string {
  const profileText = formatProfileContext(profile)
  const hiddenMines = candidateItems.slice(0, 5)
  const rounds = hiddenMines.length >= 4 ? 4 : 3

  const summaryLines = summary
    ? [
        `当前补丁等级：Lv.${summary.level.level} ${summary.level.title}（${summary.totalXp} XP，总体完成率 ${summary.overallRate}%）`,
        summary.weakestDimension
          ? `当前最薄弱维度：${summary.weakestDimension.name}（${summary.weakestDimension.completionRate}%）`
          : '',
      ].filter(Boolean).join('\n')
    : ''

  const minesSection = hiddenMines.length > 0
    ? hiddenMines
        .map(
          (item, idx) =>
            `${idx + 1}. [${item.id}]（${item.roiTier} 级 · ${item.chapterTitle}）${item.title} — ${item.plain}`,
        )
        .join('\n')
    : '（当前未传入预设暗雷，请先调用 `howtolive_search` 检索 `excludeDone: true` 的 S/A 级高性价比条目并暗中挑选 3~4 条作为本场演练暗雷，同样严禁在演练结束前剧透条目编号。）'

  return [
    `请扮演「墨菲定律考官」，为我开启一场【人生混沌工程 · 防坑演练场】沉浸式文字 RPG 压力测试（共 ${rounds} 轮突发危机）。`,
    '',
    '### 我的本地个人画像',
    profileText,
    summaryLines ? `\n### 当前六维防御概况\n${summaryLines}` : '',
    '',
    '### 本场暗雷池（仅考官可见，演练结束前绝对禁止剧透条目 ID 或原书答案）',
    minesSection,
    '',
    '### 演练规则（必须严格遵守）',
    `1. **逐轮推进**：一共进行 ${rounds} 轮连续或关联的真实生活突发危机，每轮暗中考验上面暗雷池中的 1 条盲区。`,
    '2. **严禁剧透与抢答**：每一轮只描述**当下紧迫的真实情境**，给出 **3 个贴近现实的行动选项（A / B / C）并允许我自由作答**，然后立刻停止输出并等待我回复。**绝对不要在同一轮里揭晓正确答案、不要提前展示条目 ID、不要代替我做选择。**',
    '3. **沉浸感与真实代价**：根据我上一轮的选择，简短给出合乎现实逻辑的“现场后果反馈”，再切入下一轮危机。',
    '4. **终局复盘与工具核验**：在全部轮次结束后，**必须调用 `howtolive_get_item`** 逐一核验本次演练触发的原书条目原文（以便核对 `evidenceGrade` 与 `sources`，并在对话底部生成可一键加入行动清单的补丁卡片），然后输出：',
    '   - **生存评分**（0~100 分 + 一句话锐评）',
    '   - **踩坑复盘**（我在哪几轮躲过了坑、哪几轮中招、现实中会付出什么代价）',
    '   - **本次暴露的待打补丁清单**（标注条目 ID、性价比等级、证据等级与今天就能做的第一步）',
    '',
    '现在请直接进入【第 1 轮】危机现场！',
  ].filter(Boolean).join('\n')
}

/**
 * 构造「行动清单 AI 排期」提示词：
 * 将当前处于 `planned`（行动清单）的条目连同成本/耗时信息发送给 DeepSeek，
 * 生成一份可在本周末落地执行的分时段行动时间表。
 */
export function buildWeekendPlanPrompt(
  plannedItems: readonly KnowledgeItemSummary[],
  profile: UserProfile,
  summary?: ScoreSummary,
): string {
  const profileText = formatProfileContext(profile)
  const sorted = [...plannedItems].sort(
    (a, b) =>
      DRILL_TIER_RANK[a.roiTier] - DRILL_TIER_RANK[b.roiTier]
      || (a.tags?.money === '0' ? 0 : 1) - (b.tags?.money === '0' ? 0 : 1)
      || b.roiScore - a.roiScore
      || a.chapterNumber - b.chapterNumber
      || a.number - b.number,
  )
  const MAX_ITEMS = 20
  const selected = sorted.slice(0, MAX_ITEMS)
  const omittedCount = Math.max(0, sorted.length - selected.length)

  const itemLines = selected.map((item, idx) => {
    const costTags: string[] = []
    if (item.tags?.money) costTags.push(`花钱:${item.tags.money}`)
    if (item.tags?.time) costTags.push(`耗时:${item.tags.time}`)
    if (item.tags?.willpower) costTags.push(`毅力:${item.tags.willpower}`)
    const tagPart = costTags.length > 0 ? costTags.join(' / ') : item.cost || '见详情'
    return `${idx + 1}. [${item.id}]（${item.roiTier} 级 · ${tagPart}）${item.title} — ${item.plain}`
  })

  if (omittedCount > 0) {
    itemLines.push(`（其余 ${omittedCount} 条待办可作为后续批次，本周末优先安排上述高性价比条目。）`)
  }

  const summaryLine = summary
    ? `当前进度：Lv.${summary.level.level} ${summary.level.title}，待办行动清单共 ${plannedItems.length} 条。`
    : `当前待办行动清单共 ${plannedItems.length} 条。`

  return [
    '请帮我把当前「行动清单」里的待办人生补丁，排成一份【本周末可执行的时间表】（覆盖周六上午、周六下午、周日上午、周日下午四个时段）。',
    '',
    '### 我的本地个人画像',
    profileText,
    summaryLine,
    '',
    '### 我的行动清单（含成本与耗时标签）',
    itemLines.length > 0 ? itemLines.join('\n') : '（请先调用 `howtolive_search` 检索 `status: "planned"` 的条目。）',
    '',
    '### 排期与输出要求',
    '1. 如需确认具体操作步骤或所需材料，请调用 `howtolive_get_item` 核对原书完整原文，不要凭空编造流程。',
    '2. **按阻力由低到高编排**：优先把「零花钱 / 零耗时 / 不靠毅力」的条目放在周六上午热身快速拿下，把需要出门、集中核对证件或较耗时的任务合理分散在周六下午和周日，确保本周末真实可落地、不过载。',
    '3. 每个时段明确列出：**条目 ID 与标题**、**预计耗时与花钱预算**、**提前准备的材料/App**、**完成的验收标准**。',
    '4. 如果清单条目较多，明确区分「本周末必做」与「顺延至下周」的批次，并在末尾提醒我完成后回到面板逐条打卡领取 XP；涉及医疗/法律/财务条目请遵守原书 `evidenceGrade` 与 `sources` 边界。',
  ].join('\n')
}

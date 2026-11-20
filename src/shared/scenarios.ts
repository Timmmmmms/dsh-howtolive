import type { ScenarioPreset, ScoreSummary, UserProfile } from './types.ts'

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

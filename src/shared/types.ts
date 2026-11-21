/**
 * Host 与 Client 共享的领域类型定义。
 */

/** 六大人生属性维度标识 */
export type DimensionId =
  | 'survival'
  | 'wealth'
  | 'legal'
  | 'career'
  | 'family'
  | 'resilience'

/** 性价比等级 */
export type RoiTier = 'S' | 'A' | 'B' | 'C'

/** 单条建议的用户执行状态 */
export type ItemStatus = 'todo' | 'planned' | 'done' | 'skipped'

/** 列表排序模式 */
export type SortMode = 'chapter' | 'roi' | 'zeroCost' | 'xp' | 'noted'

/** 主视图模式：卡片清单 / 漏洞扫描 / 关系星图 */
export type ViewMode = 'cards' | 'cve' | 'graph'

/** 成就徽章唯一标识（V2 公共领域契约） */
export type BadgeId =
  | 'first-patch'
  | 'zero-cost-master'
  | 'clear-declutter'
  | 'cyber-armor'
  | 'golden-four-min'
  | 'labor-law-dict'
  | 'hexagon-warrior'
  | 'note-keeper'
  | 's-tier-hunter'
  | 'annual-inspector'

/** 成就徽章计算结果 */
export interface BadgeInfo {
  id: BadgeId
  name: string
  description: string
  unlocked: boolean
  current: number
  target: number
  progressPct: number
}

/** 人生漏洞严重等级 */
export type VulnerabilitySeverity = 'CRITICAL' | 'HIGH'

/** 系统安全状态评级 */
export type SecurityStatus = 'Exposed' | 'Guarded' | 'Hardened'

/** 单条人生漏洞扫描结果 */
export interface LifeVulnerability {
  cveId: string
  severity: VulnerabilitySeverity
  item: KnowledgeItemSummary
  status: ItemStatus
  reason: string
  score: number
}

/** 人生 OS 架构师名片画像（严格脱敏） */
export interface LifeOsProfile {
  version: string
  archetype: string
  tagline: string
  securityStatus: SecurityStatus
  overallRate: number
  level: LevelInfo
  dimensions: DimensionScore[]
  featuredBadges: BadgeInfo[]
}

/** 结构化成本与收益标签 */
export interface CostTags {
  money: string | null
  time: string | null
  willpower: string | null
  benefit: string | null
  metric: string | null
  audience: string[]
  raw: string
}

/** 精简条目信息（用于列表索引、引导加载和模型检索） */
export interface KnowledgeItemSummary {
  id: string
  chapterNumber: number
  chapterTitle: string
  number: number
  title: string
  topic: string | null
  dimension: DimensionId
  tags: CostTags | null
  roiScore: number
  roiTier: RoiTier
  xp: number
  plain: string
  cost: string
  evidenceGrade: string
  crossRefs: string[]
}

/** 完整循证条目信息 */
export interface KnowledgeItem extends KnowledgeItemSummary {
  benefit: string
  sources: string
  notes: string
  extra?: Record<string, string>
  rawMarkdown: string
}

/** 章节内的主题分组 */
export interface TopicGroup {
  name: string
  itemNumbers: number[]
}

/** 章节元信息 */
export interface ChapterInfo {
  number: number
  slug: string
  filename: string
  title: string
  dimension: DimensionId
  summary: string
  topics: TopicGroup[]
  itemCount: number
}

/** 维度元信息 */
export interface DimensionMeta {
  id: DimensionId
  name: string
  subtitle: string
  chapterNumbers: number[]
  itemCount: number
}

/** 知识库元信息 */
export interface KnowledgeMeta {
  schemaVersion: number
  generatedAt: string
  upstream: {
    repo: string
    url: string
    commitSha: string | null
    sourceType: string
  }
  stats: {
    chapterCount: number
    itemCount: number
    taggedItemCount: number
    tierCounts: Record<RoiTier, number>
    topAudiences: Array<{ name: string; count: number }>
  }
  dimensions: DimensionMeta[]
}

/** data/knowledge.json 完整结构 */
export interface KnowledgeDatabase {
  meta: KnowledgeMeta
  chapters: ChapterInfo[]
  items: KnowledgeItem[]
}

/** 本地个人画像（仅保存在本地 Host，绝不上传第三方） */
export interface UserProfile {
  ageGroup?: '18-25' | '26-35' | '36-45' | '46-60' | '60+'
  occupation?: 'programmer' | 'office' | 'freelance' | 'business' | 'student' | 'other'
  housing?: 'renting' | 'buying' | 'owned' | 'family'
  family?: Array<'single' | 'partner' | 'pregnant' | 'infant' | 'child' | 'elderly'>
  goals?: Array<'health' | 'money' | 'legal' | 'career' | 'family' | 'security'>
  customNote?: string
  updatedAt?: string
}

/** 单条进度记录 */
export interface ItemProgress {
  status: ItemStatus
  note?: string
  /** 可选复检周期（天数，如 90 / 180 / 365） */
  reviewIntervalDays?: number
  /** 最近一次完成复检的时间戳（ISO 8601） */
  lastReviewedAt?: string
  updatedAt: string
}

/** 单条进度局部更新载荷 */
export interface ItemProgressPatch {
  status?: ItemStatus
  note?: string
  /** 传 null 或 <= 0 表示取消复检周期 */
  reviewIntervalDays?: number | null
  /** 传 null 表示清除复检时间 */
  lastReviewedAt?: string | null
}

/** 今日高性价比一抽持久化状态 */
export interface DailyPickState {
  date: string
  itemId: string
  rerollHistory: string[]
}

/** 本地状态持久化根对象 */
export interface HowToLiveState {
  version: 1
  profile: UserProfile
  progress: Record<string, ItemProgress>
  dailyPick?: DailyPickState
  updatedAt: string
}

/** 单维度统计得分 */
export interface DimensionScore {
  id: DimensionId
  name: string
  subtitle: string
  total: number
  done: number
  planned: number
  skipped: number
  effectiveTotal: number
  completionRate: number
  earnedXp: number
  possibleXp: number
}

/** 等级与头衔信息 */
export interface LevelInfo {
  level: number
  title: string
  totalXp: number
  currentLevelMinXp: number
  nextLevelXp: number | null
  progressPct: number
}

/** 整体评分摘要 */
export interface ScoreSummary {
  totalXp: number
  level: LevelInfo
  totalCount: number
  doneCount: number
  plannedCount: number
  skippedCount: number
  effectiveCount: number
  overallRate: number
  dimensions: DimensionScore[]
  weakestDimension: DimensionScore | null
}

/** 情景急救箱预设 */
export interface ScenarioPreset {
  id: string
  icon: string
  title: string
  subtitle: string
  chapters: number[]
  keywords: string[]
  urgentTip: string
}

/** 前端初始化引导数据 */
export interface BootstrapPayload {
  meta: KnowledgeMeta
  chapters: ChapterInfo[]
  items: KnowledgeItemSummary[]
  state: HowToLiveState
  summary: ScoreSummary
  dailyPickItem: KnowledgeItemSummary | null
}

/** 轻量状态刷新响应（不含全量 772 条摘要） */
export interface StatePayload {
  state: HowToLiveState
  summary: ScoreSummary
  dailyPickItem: KnowledgeItemSummary | null
}

/** 单条状态更新响应 */
export interface ProgressUpdateResult {
  state: HowToLiveState
  summary: ScoreSummary
  xpDelta: number
  previousStatus: ItemStatus
  currentStatus: ItemStatus
  dimensionBefore: DimensionScore | null
  dimensionAfter: DimensionScore | null
}

/** 多维检索条件 */
export interface SearchItemsQuery {
  query?: string
  dimension?: DimensionId
  chapterNumber?: number
  roiTiers?: RoiTier[]
  evidenceGrades?: Array<'A' | 'B' | 'C'>
  maxMoney?: '0' | '少' | '中'
  audience?: string
  status?: ItemStatus | 'all'
  excludeDone?: boolean
  limit?: number
  offset?: number
}

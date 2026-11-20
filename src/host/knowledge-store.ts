import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ChapterInfo,
  DimensionId,
  ItemProgress,
  ItemStatus,
  KnowledgeDatabase,
  KnowledgeItem,
  KnowledgeItemSummary,
  KnowledgeMeta,
  RoiTier,
  SearchItemsQuery,
  UserProfile,
} from '../shared/types.ts'

/** 向上查找包含 data/knowledge.json 的包根目录 */
export function resolvePackageRoot(startDir = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = startDir
  while (true) {
    if (existsSync(path.join(dir, 'data', 'knowledge.json'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`dsh-howtolive: 未找到 data/knowledge.json（起始目录：${startDir}）`)
}

/** 将完整条目裁剪为精简摘要（控制列表负载与模型上下文开销） */
export function toItemSummary(item: KnowledgeItem): KnowledgeItemSummary {
  return {
    id: item.id,
    chapterNumber: item.chapterNumber,
    chapterTitle: item.chapterTitle,
    number: item.number,
    title: item.title,
    topic: item.topic,
    dimension: item.dimension,
    tags: item.tags,
    roiScore: item.roiScore,
    roiTier: item.roiTier,
    xp: item.xp,
    plain: item.plain,
    cost: item.cost,
    evidenceGrade: item.evidenceGrade,
    crossRefs: item.crossRefs,
  }
}

const MONEY_ORDER: Record<string, number> = {
  '0': 0,
  '少': 1,
  '中': 2,
  '多': 3,
}

/** 根据日期与重抽次数确定性选取整数索引，保证同一天重刷新前结果稳定 */
function stableHash(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** 从用户画像提取倾向性关键词与章节偏好 */
function profilePreferenceScore(item: KnowledgeItem, profile: UserProfile): number {
  let boost = 0
  const aud = item.tags?.audience ?? []

  if (profile.occupation === 'programmer' || profile.occupation === 'freelance') {
    if (item.chapterNumber === 11 || item.chapterNumber === 26 || item.chapterNumber === 14) boost += 25
  }
  if (profile.housing === 'renting' && item.chapterNumber === 15) boost += 25
  if (profile.housing === 'buying' && (item.chapterNumber === 15 || item.chapterNumber === 5)) boost += 20

  const family = profile.family ?? []
  if (family.includes('pregnant') && aud.includes('怀孕')) boost += 30
  if (family.includes('infant') && (aud.includes('婴幼儿') || aud.includes('孩子'))) boost += 30
  if (family.includes('child') && aud.includes('孩子')) boost += 25
  if (family.includes('elderly') && (aud.includes('老人') || aud.includes('60岁'))) boost += 25

  const goals = profile.goals ?? []
  const goalDimMap: Record<string, DimensionId> = {
    health: 'survival',
    money: 'wealth',
    legal: 'legal',
    career: 'career',
    family: 'family',
    security: 'resilience',
  }
  for (const g of goals) {
    if (goalDimMap[g] === item.dimension) boost += 15
  }

  return boost
}

export interface SearchResultPage {
  items: KnowledgeItemSummary[]
  total: number
}

/**
 * 内存知识库索引与多维检索服务。
 */
export class KnowledgeStore {
  readonly dataPath: string
  private db!: KnowledgeDatabase
  private byId = new Map<string, KnowledgeItem>()
  private summaryList: KnowledgeItemSummary[] = []

  constructor(dataPath?: string) {
    this.dataPath = dataPath ?? path.join(resolvePackageRoot(), 'data', 'knowledge.json')
  }

  /** 同步加载知识库（供插件同步初始化或测试使用） */
  loadSync(): this {
    const raw = readFileSync(this.dataPath, 'utf8')
    this.ingest(JSON.parse(raw) as KnowledgeDatabase)
    return this
  }

  /** 异步重新加载知识库（用于同步脚本刷新后热重载） */
  async reload(): Promise<this> {
    const raw = await readFile(this.dataPath, 'utf8')
    this.ingest(JSON.parse(raw) as KnowledgeDatabase)
    return this
  }

  private ingest(db: KnowledgeDatabase): void {
    this.db = db
    this.byId.clear()
    this.summaryList = []
    for (const item of db.items) {
      this.byId.set(item.id, item)
      this.summaryList.push(toItemSummary(item))
    }
  }

  get meta(): KnowledgeMeta {
    return this.db.meta
  }

  get chapters(): readonly ChapterInfo[] {
    return this.db.chapters
  }

  get allItems(): readonly KnowledgeItem[] {
    return this.db.items
  }

  get allSummaries(): readonly KnowledgeItemSummary[] {
    return this.summaryList
  }

  getById(id: string): KnowledgeItem | undefined {
    return this.byId.get(id)
  }

  /** 解析交叉引用条目摘要列表 */
  getCrossRefSummaries(item: KnowledgeItem): KnowledgeItemSummary[] {
    const out: KnowledgeItemSummary[] = []
    for (const refId of item.crossRefs) {
      const target = this.byId.get(refId)
      if (target) out.push(toItemSummary(target))
    }
    return out
  }

  /** 多维检索与相关性排序 */
  search(
    params: SearchItemsQuery,
    progressMap: Readonly<Record<string, ItemProgress | undefined>> = {},
  ): SearchResultPage {
    const tokens = (params.query ?? '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    const maxMoneyRank = params.maxMoney ? (MONEY_ORDER[params.maxMoney] ?? 99) : 99
    const tierSet = params.roiTiers && params.roiTiers.length > 0 ? new Set<RoiTier>(params.roiTiers) : null
    const gradeSet = params.evidenceGrades && params.evidenceGrades.length > 0
      ? new Set(params.evidenceGrades.map((g) => g.toUpperCase()))
      : null
    const audienceFilter = params.audience?.trim().toLowerCase() || null

    const matched: Array<{ item: KnowledgeItem; relevance: number }> = []

    for (const item of this.db.items) {
      if (params.dimension && item.dimension !== params.dimension) continue
      if (params.chapterNumber !== undefined && item.chapterNumber !== params.chapterNumber) continue
      if (tierSet && !tierSet.has(item.roiTier)) continue

      if (gradeSet) {
        const grade = item.evidenceGrade.trim().toUpperCase().slice(0, 1)
        if (!gradeSet.has(grade)) continue
      }

      if (params.maxMoney) {
        const itemMoney = item.tags?.money
        const rank = itemMoney !== null && itemMoney !== undefined ? (MONEY_ORDER[itemMoney] ?? 99) : 99
        if (rank > maxMoneyRank) continue
      }

      if (audienceFilter) {
        const audList = item.tags?.audience ?? []
        const hitAud = audList.some((a) => a.toLowerCase().includes(audienceFilter))
        if (!hitAud) continue
      }

      const userStatus: ItemStatus = progressMap[item.id]?.status ?? 'todo'
      if (params.excludeDone && (userStatus === 'done' || userStatus === 'skipped')) continue
      if (params.status && params.status !== 'all' && userStatus !== params.status) continue

      let relevance = 0
      if (tokens.length > 0) {
        const idLower = item.id.toLowerCase()
        const titleLower = item.title.toLowerCase()
        const plainLower = item.plain.toLowerCase()
        const chapterLower = item.chapterTitle.toLowerCase()
        const topicLower = (item.topic ?? '').toLowerCase()
        const costLower = item.cost.toLowerCase()
        const benefitLower = item.benefit.toLowerCase()
        const notesLower = item.notes.toLowerCase()
        const audLower = (item.tags?.audience ?? []).join(' ').toLowerCase()

        let allMatched = true
        for (const tok of tokens) {
          let tokScore = 0
          if (idLower === tok) tokScore += 100
          if (titleLower.includes(tok)) tokScore += 40
          if (plainLower.includes(tok)) tokScore += 25
          if (topicLower.includes(tok) || chapterLower.includes(tok)) tokScore += 15
          if (audLower.includes(tok)) tokScore += 15
          if (costLower.includes(tok) || benefitLower.includes(tok) || notesLower.includes(tok)) tokScore += 8

          if (tokScore === 0) {
            allMatched = false
            break
          }
          relevance += tokScore
        }
        if (!allMatched) continue
      }

      matched.push({ item, relevance })
    }

    matched.sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance
      if (b.item.roiScore !== a.item.roiScore) return b.item.roiScore - a.item.roiScore
      if (a.item.chapterNumber !== b.item.chapterNumber) return a.item.chapterNumber - b.item.chapterNumber
      return a.item.number - b.item.number
    })

    const offset = Math.max(0, params.offset ?? 0)
    const limit = Math.max(1, Math.min(200, params.limit ?? 20))
    const slice = matched.slice(offset, offset + limit).map((m) => toItemSummary(m.item))

    return {
      items: slice,
      total: matched.length,
    }
  }

  /**
   * 「今日高性价比一抽」选卡逻辑：
   * 优先从未完成的低成本 S/A 级条目中挑选，并结合本地个人画像加权。
   */
  pickDailyItem(
    progressMap: Readonly<Record<string, ItemProgress | undefined>>,
    profile: UserProfile,
    excludeIds: readonly string[] = [],
    seedKey = new Date().toISOString().slice(0, 10),
  ): KnowledgeItemSummary | null {
    const excluded = new Set(excludeIds)

    const unfinished = this.db.items.filter((item) => {
      const status = progressMap[item.id]?.status ?? 'todo'
      return status === 'todo' || status === 'planned'
    })
    if (unfinished.length === 0) return null

    // 第 1 梯队：未完成 + S/A 级 + 低金钱成本（0 或 少）+ 未被今天跳过
    let pool = unfinished.filter(
      (item) =>
        !excluded.has(item.id)
        && (item.roiTier === 'S' || item.roiTier === 'A')
        && (item.tags?.money === '0' || item.tags?.money === '少'),
    )
    // 回退梯队 2：任意未完成 S/A 级（未被跳过）
    if (pool.length === 0) {
      pool = unfinished.filter((item) => !excluded.has(item.id) && (item.roiTier === 'S' || item.roiTier === 'A'))
    }
    // 回退梯队 3：任意未完成（未被跳过）
    if (pool.length === 0) {
      pool = unfinished.filter((item) => !excluded.has(item.id))
    }
    // 回退梯队 4：允许重新循环今日池
    if (pool.length === 0) {
      pool = unfinished
    }

    // 优先在最高画像匹配分 Top-25% 子集中抽卡，兼具精准与惊喜感
    const scored = pool
      .map((item) => ({
        item,
        score: item.roiScore + profilePreferenceScore(item, profile),
      }))
      .sort((a, b) => b.score - a.score)

    const topWindowSize = Math.max(1, Math.min(scored.length, Math.max(12, Math.ceil(scored.length * 0.25))))
    const topWindow = scored.slice(0, topWindowSize)
    const idx = stableHash(seedKey) % topWindow.length
    const chosen = topWindow[idx]?.item ?? scored[0]?.item
    return chosen ? toItemSummary(chosen) : null
  }
}

import type {
  ItemProgress,
  ItemStatus,
  KnowledgeItemSummary,
  UserProfile,
} from './types.ts'

/** 不适用筛查命中原因标识（对应双语词典 key） */
export type ProfileSkipReasonId =
  | 'notPregnant'
  | 'noInfant'
  | 'noChild'
  | 'noElderly'
  | 'notDeveloper'
  | 'notBusiness'
  | 'notRenting'
  | 'notStudent'

/** 单条被识别为「可能不适用」的候选建议 */
export interface ProfileSkipCandidate {
  readonly item: KnowledgeItemSummary
  readonly reasonId: ProfileSkipReasonId
}

/** 按命中原因聚合的候选分组 */
export interface ProfileSkipGroup {
  readonly reasonId: ProfileSkipReasonId
  readonly items: KnowledgeItemSummary[]
}

/** 画像智能筛查结果 */
export interface ProfileSkipAnalysis {
  readonly groups: ProfileSkipGroup[]
  readonly candidates: ProfileSkipCandidate[]
  readonly totalCount: number
}

const REASON_ORDER: readonly ProfileSkipReasonId[] = [
  'notPregnant',
  'noInfant',
  'noChild',
  'noElderly',
  'notDeveloper',
  'notBusiness',
  'notRenting',
  'notStudent',
]

const RENTING_KEYWORD_RE = /租房|房东|押金|合租|二房东|中介|退租|承租|公租房|廉租房/

function hasAudience(item: KnowledgeItemSummary, keyword: string): boolean {
  const aud = item.tags?.audience ?? []
  return aud.some((a) => a.includes(keyword))
}

function isRentingSpecificItem(item: KnowledgeItemSummary): boolean {
  if (item.chapterNumber !== 15) return false
  const text = `${item.title} ${item.topic ?? ''} ${item.plain}`
  return RENTING_KEYWORD_RE.test(text)
}

/**
 * 判定单条处于 `todo` 状态的建议是否与当前用户画像明显不适用。
 * 规则采用高置信度保守原则：仅当用户明确填写了对应维度画像且未勾选相关人群时才触发。
 */
function matchSkipReason(
  item: KnowledgeItemSummary,
  profile: UserProfile,
): ProfileSkipReasonId | null {
  const family = profile.family ?? []
  const hasFamilyConfigured = family.length > 0

  // 1. 家庭阶段相关（仅在用户明确填写了家庭情况时触发）
  if (hasFamilyConfigured) {
    const hasPregnant = family.includes('pregnant')
    const hasInfant = family.includes('infant')
    const hasChild = family.includes('child')
    const hasElderly = family.includes('elderly')

    if (!hasPregnant && (item.chapterNumber === 27 || hasAudience(item, '怀孕'))) {
      return 'notPregnant'
    }
    if (!hasInfant && !hasPregnant && (item.chapterNumber === 20 || hasAudience(item, '婴幼儿'))) {
      return 'noInfant'
    }
    if (!hasChild && !hasInfant && !hasPregnant && (item.chapterNumber === 30 || hasAudience(item, '孩子'))) {
      return 'noChild'
    }
    if (!hasElderly && profile.ageGroup !== '60+' && (item.chapterNumber === 17 || hasAudience(item, '老人') || hasAudience(item, '60岁'))) {
      return 'noElderly'
    }
  }

  // 2. 职业特征相关（仅在用户明确选择了职业时触发）
  if (profile.occupation) {
    const isTech = profile.occupation === 'programmer' || profile.occupation === 'freelance'
    if (!isTech && (item.chapterNumber === 11 || item.chapterNumber === 26)) {
      return 'notDeveloper'
    }

    const isBiz = profile.occupation === 'business' || profile.occupation === 'freelance'
    if (!isBiz && item.chapterNumber === 12) {
      return 'notBusiness'
    }

    const isStudent = profile.occupation === 'student'
    const isPastStudentAge =
      profile.ageGroup === '26-35'
      || profile.ageGroup === '36-45'
      || profile.ageGroup === '46-60'
      || profile.ageGroup === '60+'
    if (!isStudent && isPastStudentAge && (item.chapterNumber === 31 || item.chapterNumber === 32)) {
      return 'notStudent'
    }
  }

  // 3. 居住状态相关（明确为自有住房或与家人同住时，筛查第 15 章纯租房条目）
  if (
    (profile.housing === 'owned' || profile.housing === 'family')
    && isRentingSpecificItem(item)
  ) {
    return 'notRenting'
  }

  return null
}

/**
 * 基于本地个人画像，扫描当前尚未处理（status === 'todo'）且明显不适用的条目，
 * 返回按原因分组的预览清单（绝不静默修改任何进度，需由用户在向导中勾选确认）。
 */
export function findProfileSkipCandidates(
  items: readonly KnowledgeItemSummary[],
  progressMap: Readonly<Record<string, ItemProgress | undefined>>,
  profile: UserProfile | undefined,
): ProfileSkipAnalysis {
  if (!profile) {
    return { groups: [], candidates: [], totalCount: 0 }
  }

  const bucket = new Map<ProfileSkipReasonId, KnowledgeItemSummary[]>()
  const candidates: ProfileSkipCandidate[] = []

  for (const item of items) {
    const status: ItemStatus = progressMap[item.id]?.status ?? 'todo'
    // 只筛查尚未处理的 todo 条目，绝不触碰用户已 done / planned / skipped 的条目
    if (status !== 'todo') continue

    const reasonId = matchSkipReason(item, profile)
    if (!reasonId) continue

    candidates.push({ item, reasonId })
    const list = bucket.get(reasonId)
    if (list) list.push(item)
    else bucket.set(reasonId, [item])
  }

  const groups: ProfileSkipGroup[] = []
  for (const reasonId of REASON_ORDER) {
    const list = bucket.get(reasonId)
    if (!list || list.length === 0) continue
    list.sort((a, b) => a.chapterNumber - b.chapterNumber || a.number - b.number)
    groups.push({ reasonId, items: list })
  }

  return {
    groups,
    candidates,
    totalCount: candidates.length,
  }
}

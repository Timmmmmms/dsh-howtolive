import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import { computeScoreSummary } from '../shared/scoring.ts'
import { formatProfileContext } from '../shared/scenarios.ts'
import type {
  DimensionId,
  ItemStatus,
  KnowledgeItemSummary,
  RoiTier,
} from '../shared/types.ts'
import type { KnowledgeStore } from './knowledge-store.ts'
import type { StateStore } from './state-store.ts'

const DIMENSION_IDS = ['survival', 'wealth', 'legal', 'career', 'family', 'resilience'] as const satisfies readonly DimensionId[]
const ROI_TIERS = ['S', 'A', 'B', 'C'] as const satisfies readonly RoiTier[]
const EVIDENCE_GRADES = ['A', 'B', 'C'] as const
const MONEY_LEVELS = ['0', '少', '中'] as const
const ITEM_STATUSES = ['todo', 'planned', 'done', 'skipped'] as const satisfies readonly ItemStatus[]

function renderJsonValue(_args: unknown, value: unknown): ContentBlock[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

function present(title: string, kind: 'read' | 'other', rawInput?: unknown): GenericCallView {
  return { card: 'generic', title, kind, ...(rawInput === undefined ? {} : { rawInput }) }
}

const SUMMARY_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    chapterNumber: { type: 'integer', required: true },
    chapterTitle: { type: 'string', required: true },
    title: { type: 'string', required: true },
    topic: { type: 'string' },
    dimension: { type: 'string', required: true, enum: DIMENSION_IDS },
    roiTier: { type: 'string', required: true, enum: ROI_TIERS },
    roiScore: { type: 'integer', required: true },
    xp: { type: 'integer', required: true },
    evidenceGrade: { type: 'string', required: true },
    cost: { type: 'string', required: true },
    plain: { type: 'string', required: true },
    moneyTag: { type: 'string' },
    timeTag: { type: 'string' },
    willpowerTag: { type: 'string' },
    benefitTag: { type: 'string' },
    audience: { type: 'array', items: { type: 'string' } },
    userStatus: { type: 'string', required: true, enum: ITEM_STATUSES },
    userNote: { type: 'string' },
  },
} as const

function serializeModelSummary(
  item: KnowledgeItemSummary,
  userStatus: ItemStatus,
  userNote?: string,
) {
  return {
    id: item.id,
    chapterNumber: item.chapterNumber,
    chapterTitle: item.chapterTitle,
    title: item.title,
    ...(item.topic ? { topic: item.topic } : {}),
    dimension: item.dimension,
    roiTier: item.roiTier,
    roiScore: item.roiScore,
    xp: item.xp,
    evidenceGrade: item.evidenceGrade || 'C',
    cost: item.cost,
    plain: item.plain,
    ...(item.tags?.money ? { moneyTag: item.tags.money } : {}),
    ...(item.tags?.time ? { timeTag: item.tags.time } : {}),
    ...(item.tags?.willpower ? { willpowerTag: item.tags.willpower } : {}),
    ...(item.tags?.benefit ? { benefitTag: item.tags.benefit } : {}),
    ...(item.tags?.audience?.length ? { audience: item.tags.audience } : {}),
    userStatus,
    ...(userNote ? { userNote } : {}),
  }
}

const HOWTOLIVE_SYSTEM_GUIDANCE = [
  '你可以使用 `howtolive_*` 系列工具检索《高性价比人生指南》（人生补丁）的本地循证知识库并更新用户本地执行进度。',
  '使用准则：',
  '1. 优先调用 `howtolive_search` / `howtolive_get_item` 检索原文，禁止凭记忆编造条目 ID、法规条文、赔偿比例或医疗剂量。',
  '2. 回答健康、法律、重大财务问题时，必须忠实引用条目的 `evidenceGrade`（证据等级）与 `sources`（来源出处）；遇到紧急危及生命的情况应立即提醒拨打 120 / 110 或前往急诊。',
  '3. 默认排除用户已标记 `done` 或 `skipped`（不适用）的条目，优先推荐零成本/低成本 S/A 级高性价比条目。',
  '4. 仅在用户明确表示“已做到”“加入待办”“标记不适用”或“记录笔记”时，才调用 `howtolive_update_item` 或 `howtolive_batch_update_items`（多条更新优先使用批量工具减少往返）。',
].join('\n')

/**
 * 向 DeepSeek 模型注册 4 个 howtolive 工具及系统提示词指引。
 */
export function registerHowToLiveTools(
  ctx: Context,
  knowledge: KnowledgeStore,
  stateStore: StateStore,
): () => void {
  const disposers: Array<() => void> = []

  disposers.push(
    ctx.systemPrompt.section({
      name: 'tool:howtolive',
      order: 750,
      interpolate: false,
      text: ({ scope }) => (ctx.tools.get('howtolive_search', scope) !== undefined ? HOWTOLIVE_SYSTEM_GUIDANCE : ''),
    }),
  )

  // 1. howtolive_search
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'howtolive_search',
        description:
          '检索《高性价比人生指南》本地循证知识库，支持按关键词、六维分类、章节、性价比分级(S/A/B/C)、证据等级(A/B/C)、金钱成本上限与人群标签筛选，返回精简结构化条目及用户当前状态。',
        parameters: {
          query: { type: 'string', description: '搜索关键词（空格分词，匹配标题、说人话、成本、收益、备注或条目 ID）。' },
          dimension: { type: 'string', enum: DIMENSION_IDS, description: '人生维度筛选：survival(生命防线)/wealth(财富护城河)/legal(法律防坑盾)/career(职场与效率)/family(家庭与关系)/resilience(安全与韧性)。' },
          chapterNumber: { type: 'integer', description: '按原书章节号筛选（1-34）。' },
          roiTiers: { type: 'array', items: { type: 'string', enum: ROI_TIERS }, description: '性价比等级列表，如 ["S", "A"]。' },
          evidenceGrades: { type: 'array', items: { type: 'string', enum: EVIDENCE_GRADES }, description: '证据等级列表，如 ["A", "B"]。' },
          maxMoney: { type: 'string', enum: MONEY_LEVELS, description: '金钱成本上限："0"(不花钱)/"少"(花极少钱)/"中"。' },
          audience: { type: 'string', description: '人群标签筛选，如 "孩子"、"老人"、"怀孕"、"婴幼儿"、"女性"。' },
          excludeDone: { type: 'boolean', description: '是否排除已完成(done)和不适用(skipped)的条目，默认 true。' },
          limit: { type: 'integer', description: '最多返回条数（1-20），默认 8。' },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              total: { type: 'integer', required: true },
              items: { type: 'array', required: true, items: SUMMARY_ITEM_SCHEMA },
            },
          },
          render: renderJsonValue,
        },
        isConcurrencySafe: () => true,
        async execute(args) {
          const state = stateStore.getSnapshot()
          const limit = Math.max(1, Math.min(20, args.limit ?? 8))
          const excludeDone = args.excludeDone ?? true
          const page = knowledge.search(
            {
              ...(args.query !== undefined ? { query: args.query } : {}),
              ...(args.dimension !== undefined ? { dimension: args.dimension } : {}),
              ...(args.chapterNumber !== undefined ? { chapterNumber: args.chapterNumber } : {}),
              ...(args.roiTiers !== undefined ? { roiTiers: [...args.roiTiers] } : {}),
              ...(args.evidenceGrades !== undefined ? { evidenceGrades: [...args.evidenceGrades] } : {}),
              ...(args.maxMoney !== undefined ? { maxMoney: args.maxMoney } : {}),
              ...(args.audience !== undefined ? { audience: args.audience } : {}),
              excludeDone,
              limit,
            },
            state.progress,
          )
          return {
            total: page.total,
            items: page.items.map((item) => {
              const prog = state.progress[item.id]
              return serializeModelSummary(item, prog?.status ?? 'todo', prog?.note)
            }),
          }
        },
        presentCall: (args) => present('检索人生指南', 'read', args.query ?? args.dimension ?? 'all'),
      }),
    ),
  )

  // 2. howtolive_get_item
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'howtolive_get_item',
        description: '按条目 ID（如 "01-10"）读取单条建议的完整循证详情，包括完整收益数据、原始研究/法规来源出处、操作备注、交叉引用摘要与用户本地进度/笔记。',
        parameters: {
          id: { type: 'string', required: true, description: '条目 ID，例如 "01-01" 或 "19-03"。' },
        },
        output: {
          schema: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  found: { type: 'boolean', required: true, const: true },
                  id: { type: 'string', required: true },
                  chapterNumber: { type: 'integer', required: true },
                  chapterTitle: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  topic: { type: 'string' },
                  dimension: { type: 'string', required: true, enum: DIMENSION_IDS },
                  roiTier: { type: 'string', required: true, enum: ROI_TIERS },
                  roiScore: { type: 'integer', required: true },
                  xp: { type: 'integer', required: true },
                  cost: { type: 'string', required: true },
                  plain: { type: 'string', required: true },
                  benefit: { type: 'string', required: true },
                  evidenceGrade: { type: 'string', required: true },
                  sources: { type: 'string', required: true },
                  notes: { type: 'string', required: true },
                  crossRefs: {
                    type: 'array',
                    required: true,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        id: { type: 'string', required: true },
                        title: { type: 'string', required: true },
                        roiTier: { type: 'string', required: true, enum: ROI_TIERS },
                      },
                    },
                  },
                  userStatus: { type: 'string', required: true, enum: ITEM_STATUSES },
                  userNote: { type: 'string' },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  found: { type: 'boolean', required: true, const: false },
                  id: { type: 'string', required: true },
                  message: { type: 'string', required: true },
                },
              },
            ],
          },
          render: renderJsonValue,
        },
        isConcurrencySafe: () => true,
        async execute(args) {
          const item = knowledge.getById(args.id.trim())
          if (!item) {
            return { found: false as const, id: args.id, message: `未找到编号为 ${args.id} 的条目` }
          }
          const prog = stateStore.getSnapshot().progress[item.id]
          const refs = knowledge.getCrossRefSummaries(item)
          return {
            found: true as const,
            id: item.id,
            chapterNumber: item.chapterNumber,
            chapterTitle: item.chapterTitle,
            title: item.title,
            ...(item.topic ? { topic: item.topic } : {}),
            dimension: item.dimension,
            roiTier: item.roiTier,
            roiScore: item.roiScore,
            xp: item.xp,
            cost: item.cost,
            plain: item.plain,
            benefit: item.benefit,
            evidenceGrade: item.evidenceGrade || 'C',
            sources: item.sources,
            notes: item.notes,
            crossRefs: refs.map((r) => ({ id: r.id, title: r.title, roiTier: r.roiTier })),
            userStatus: prog?.status ?? 'todo',
            ...(prog?.note ? { userNote: prog.note } : {}),
          }
        },
        presentCall: (args) => present('查看指南条目详情', 'read', args.id),
      }),
    ),
  )

  // 3. howtolive_get_summary
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'howtolive_get_summary',
        description: '读取用户本地个人画像、六维属性完成率、当前等级/XP、已加入待办(planned)的行动清单及薄弱维度缺口提示。',
        parameters: {},
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              profileSummary: { type: 'string', required: true },
              level: { type: 'integer', required: true },
              levelTitle: { type: 'string', required: true },
              totalXp: { type: 'integer', required: true },
              doneCount: { type: 'integer', required: true },
              plannedCount: { type: 'integer', required: true },
              skippedCount: { type: 'integer', required: true },
              effectiveCount: { type: 'integer', required: true },
              overallRate: { type: 'integer', required: true },
              weakestDimension: { type: 'string' },
              dimensions: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', required: true, enum: DIMENSION_IDS },
                    name: { type: 'string', required: true },
                    done: { type: 'integer', required: true },
                    effectiveTotal: { type: 'integer', required: true },
                    completionRate: { type: 'integer', required: true },
                    earnedXp: { type: 'integer', required: true },
                  },
                },
              },
              plannedItems: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', required: true },
                    title: { type: 'string', required: true },
                    roiTier: { type: 'string', required: true, enum: ROI_TIERS },
                    dimension: { type: 'string', required: true, enum: DIMENSION_IDS },
                  },
                },
              },
            },
          },
          render: renderJsonValue,
        },
        isConcurrencySafe: () => true,
        async execute() {
          const state = stateStore.getSnapshot()
          const summary = computeScoreSummary(knowledge.allSummaries, state.progress, knowledge.meta.dimensions)
          const plannedItems = knowledge.allSummaries
            .filter((item) => state.progress[item.id]?.status === 'planned')
            .slice(0, 20)
            .map((item) => ({
              id: item.id,
              title: item.title,
              roiTier: item.roiTier,
              dimension: item.dimension,
            }))

          return {
            profileSummary: formatProfileContext(state.profile),
            level: summary.level.level,
            levelTitle: summary.level.title,
            totalXp: summary.totalXp,
            doneCount: summary.doneCount,
            plannedCount: summary.plannedCount,
            skippedCount: summary.skippedCount,
            effectiveCount: summary.effectiveCount,
            overallRate: summary.overallRate,
            ...(summary.weakestDimension
              ? { weakestDimension: `${summary.weakestDimension.name} (${summary.weakestDimension.completionRate}%)` }
              : {}),
            dimensions: summary.dimensions.map((d) => ({
              id: d.id,
              name: d.name,
              done: d.done,
              effectiveTotal: d.effectiveTotal,
              completionRate: d.completionRate,
              earnedXp: d.earnedXp,
            })),
            plannedItems,
          }
        },
        presentCall: () => present('读取人生补丁概况', 'read'),
      }),
    ),
  )

  // 4. howtolive_update_item
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'howtolive_update_item',
        description: '更新指定条目的本地执行状态（todo/planned/done/skipped）或个人笔记，返回最新等级 XP 与对应维度的得分变化。',
        parameters: {
          id: { type: 'string', required: true, description: '条目 ID，例如 "01-01"。' },
          status: { type: 'string', enum: ITEM_STATUSES, description: '目标状态：todo(未做)/planned(已加入行动清单)/done(已做到)/skipped(不适用)。' },
          note: { type: 'string', description: '附加或更新的个人私有笔记（传空字符串可清空）。' },
        },
        output: {
          schema: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean', required: true, const: true },
                  id: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  previousStatus: { type: 'string', required: true, enum: ITEM_STATUSES },
                  status: { type: 'string', required: true, enum: ITEM_STATUSES },
                  note: { type: 'string' },
                  xpDelta: { type: 'integer', required: true },
                  totalXp: { type: 'integer', required: true },
                  level: { type: 'integer', required: true },
                  dimensionChange: { type: 'string', required: true },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean', required: true, const: false },
                  id: { type: 'string', required: true },
                  message: { type: 'string', required: true },
                },
              },
            ],
          },
          render: renderJsonValue,
        },
        async execute(args) {
          const item = knowledge.getById(args.id.trim())
          if (!item) {
            return { ok: false as const, id: args.id, message: `未找到编号为 ${args.id} 的条目` }
          }
          const beforeSummary = computeScoreSummary(
            knowledge.allSummaries,
            stateStore.getSnapshot().progress,
            knowledge.meta.dimensions,
          )
          const dimBefore = beforeSummary.dimensions.find((d) => d.id === item.dimension)

          const { previousStatus, currentStatus, state } = await stateStore.updateItemProgress(item.id, {
            ...(args.status !== undefined ? { status: args.status } : {}),
            ...(args.note !== undefined ? { note: args.note } : {}),
          })

          const afterSummary = computeScoreSummary(
            knowledge.allSummaries,
            state.progress,
            knowledge.meta.dimensions,
          )
          const dimAfter = afterSummary.dimensions.find((d) => d.id === item.dimension)
          const xpDelta = afterSummary.totalXp - beforeSummary.totalXp
          const deltaLabel = xpDelta === 0 ? '' : xpDelta > 0 ? ` (+${xpDelta} XP)` : ` (${xpDelta} XP)`
          const dimensionChange = dimBefore && dimAfter
            ? `${dimAfter.name} ${dimBefore.completionRate}% -> ${dimAfter.completionRate}%${deltaLabel}`
            : `总经验 ${afterSummary.totalXp} XP`

          const updatedNote = state.progress[item.id]?.note
          return {
            ok: true as const,
            id: item.id,
            title: item.title,
            previousStatus,
            status: currentStatus,
            ...(updatedNote ? { note: updatedNote } : {}),
            xpDelta,
            totalXp: afterSummary.totalXp,
            level: afterSummary.level.level,
            dimensionChange,
          }
        },
        presentCall: (args) => present('更新人生补丁进度', 'other', `${args.id}${args.status ? ` → ${args.status}` : ''}`),
      }),
    ),
  )

  // 5. howtolive_batch_update_items
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'howtolive_batch_update_items',
        description: '一次性批量更新多条建议的本地执行状态（todo/planned/done/skipped）或个人笔记（最多 20 条），单次原子落盘并返回总 XP 与等级变化。',
        parameters: {
          items: {
            type: 'array',
            required: true,
            description: '待更新条目列表（1-20 条），每项包含 id、可选 status 和可选 note。',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true, description: '条目 ID，例如 "01-01"。' },
                status: { type: 'string', enum: ITEM_STATUSES, description: '目标状态。' },
                note: { type: 'string', description: '个人私有笔记（传空字符串可清空）。' },
              },
            },
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean', required: true },
              updatedCount: { type: 'integer', required: true },
              notFoundIds: { type: 'array', required: true, items: { type: 'string' } },
              xpDelta: { type: 'integer', required: true },
              totalXp: { type: 'integer', required: true },
              level: { type: 'integer', required: true },
              results: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', required: true },
                    title: { type: 'string', required: true },
                    previousStatus: { type: 'string', required: true, enum: ITEM_STATUSES },
                    status: { type: 'string', required: true, enum: ITEM_STATUSES },
                  },
                },
              },
            },
          },
          render: renderJsonValue,
        },
        async execute(args) {
          const inputList = args.items.slice(0, 20)
          const validUpdates: Array<{ id: string; title: string; status?: ItemStatus; note?: string }> = []
          const notFoundIds: string[] = []

          for (const entry of inputList) {
            const trimmedId = entry.id.trim()
            const item = knowledge.getById(trimmedId)
            if (!item) {
              notFoundIds.push(entry.id)
              continue
            }
            validUpdates.push({
              id: item.id,
              title: item.title,
              ...(entry.status !== undefined ? { status: entry.status } : {}),
              ...(entry.note !== undefined ? { note: entry.note } : {}),
            })
          }

          const beforeSummary = computeScoreSummary(
            knowledge.allSummaries,
            stateStore.getSnapshot().progress,
            knowledge.meta.dimensions,
          )

          if (validUpdates.length === 0) {
            return {
              ok: false,
              updatedCount: 0,
              notFoundIds,
              xpDelta: 0,
              totalXp: beforeSummary.totalXp,
              level: beforeSummary.level.level,
              results: [],
            }
          }

          const { changes, state } = await stateStore.updateItemsProgressBatch(
            validUpdates.map((u) => ({
              id: u.id,
              ...(u.status !== undefined ? { status: u.status } : {}),
              ...(u.note !== undefined ? { note: u.note } : {}),
            })),
          )

          const afterSummary = computeScoreSummary(
            knowledge.allSummaries,
            state.progress,
            knowledge.meta.dimensions,
          )
          const titleById = new Map(validUpdates.map((u) => [u.id, u.title]))

          return {
            ok: true,
            updatedCount: changes.length,
            notFoundIds,
            xpDelta: afterSummary.totalXp - beforeSummary.totalXp,
            totalXp: afterSummary.totalXp,
            level: afterSummary.level.level,
            results: changes.map((c) => ({
              id: c.id,
              title: titleById.get(c.id) ?? c.id,
              previousStatus: c.previousStatus,
              status: c.currentStatus,
            })),
          }
        },
        presentCall: (args) => present('批量更新人生补丁进度', 'other', `${args.items.length} 条`),
      }),
    ),
  )

  return () => {
    for (const dispose of disposers) dispose()
  }
}

import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { computeScoreSummary } from '../shared/scoring.ts'
import type {
  BootstrapPayload,
  DailyPickState,
  ItemStatus,
  ProgressUpdateResult,
  StatePayload,
  UserProfile,
} from '../shared/types.ts'
import { buildPatchReportMarkdown } from './export.ts'
import { resolvePackageRoot, toItemSummary, type KnowledgeStore } from './knowledge-store.ts'
import type { StateStore } from './state-store.ts'

const execFileAsync = promisify(execFile)

export const API_PREFIX = '/api/plugins/howtolive'

function todayDateString(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

/**
 * 确保今日推荐卡存在且仍处于未完成状态；若为空或过期则自动抽卡并落盘。
 */
async function ensureTodayDailyPick(
  knowledge: KnowledgeStore,
  stateStore: StateStore,
): Promise<{ dailyPick: DailyPickState | undefined; itemId: string | null }> {
  const today = todayDateString()
  const state = stateStore.getSnapshot()
  const existing = state.dailyPick

  if (existing && existing.date === today) {
    const item = knowledge.getById(existing.itemId)
    const status = state.progress[existing.itemId]?.status ?? 'todo'
    if (item && (status === 'todo' || status === 'planned')) {
      return { dailyPick: existing, itemId: item.id }
    }
  }

  const rerollHistory = existing?.date === today ? existing.rerollHistory : []
  const picked = knowledge.pickDailyItem(
    state.progress,
    state.profile,
    rerollHistory,
    `${today}#${rerollHistory.length}`,
  )
  if (!picked) {
    return { dailyPick: existing, itemId: null }
  }
  const nextPick: DailyPickState = {
    date: today,
    itemId: picked.id,
    rerollHistory: rerollHistory.includes(picked.id) ? rerollHistory : [...rerollHistory, picked.id],
  }
  await stateStore.updateDailyPick(nextPick)
  return { dailyPick: nextPick, itemId: picked.id }
}

/**
 * 创建全部 Host JSON API 路由，供 Web / Desktop Client 通过 ctx.connection.fetch 访问。
 */
export function createHowToLiveRoutes(
  knowledge: KnowledgeStore,
  stateStore: StateStore,
): ConnectionFetchRoute[] {
  return [
    {
      path: `${API_PREFIX}/bootstrap`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch() {
        const { itemId } = await ensureTodayDailyPick(knowledge, stateStore)
        const state = stateStore.getSnapshot()
        const summary = computeScoreSummary(knowledge.allSummaries, state.progress, knowledge.meta.dimensions)
        const pickedFull = itemId ? knowledge.getById(itemId) : undefined
        const payload: BootstrapPayload = {
          meta: knowledge.meta,
          chapters: [...knowledge.chapters],
          items: [...knowledge.allSummaries],
          state,
          summary,
          dailyPickItem: pickedFull ? toItemSummary(pickedFull) : null,
        }
        return jsonResponse(payload)
      },
    },
    {
      path: `${API_PREFIX}/state`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch() {
        const { itemId } = await ensureTodayDailyPick(knowledge, stateStore)
        const state = stateStore.getSnapshot()
        const summary = computeScoreSummary(knowledge.allSummaries, state.progress, knowledge.meta.dimensions)
        const pickedFull = itemId ? knowledge.getById(itemId) : undefined
        const payload: StatePayload = {
          state,
          summary,
          dailyPickItem: pickedFull ? toItemSummary(pickedFull) : null,
        }
        return jsonResponse(payload)
      },
    },
    {
      path: `${API_PREFIX}/state/export`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch() {
        const state = stateStore.getSnapshot()
        const now = new Date()
        return jsonResponse({
          filename: `life-patch-state-${todayDateString(now)}.json`,
          exportedAt: now.toISOString(),
          state,
        })
      },
    },
    {
      path: `${API_PREFIX}/state/import`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        const body = await readJsonBody(request)
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return jsonResponse({ error: '无效的导入请求体' }, 400)
        }
        const record = body as Record<string, unknown>
        const rawState = 'state' in record && typeof record.state === 'object' && record.state !== null
          ? record.state
          : record
        try {
          const state = await stateStore.importState(rawState)
          const { itemId } = await ensureTodayDailyPick(knowledge, stateStore)
          const latestState = stateStore.getSnapshot()
          const summary = computeScoreSummary(knowledge.allSummaries, latestState.progress, knowledge.meta.dimensions)
          const pickedFull = itemId ? knowledge.getById(itemId) : undefined
          return jsonResponse({
            ok: true,
            state: latestState,
            summary,
            dailyPickItem: pickedFull ? toItemSummary(pickedFull) : null,
            importedAt: state.updatedAt,
          })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          return jsonResponse({ error: message }, 400)
        }
      },
    },
    {
      path: `${API_PREFIX}/item`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        const url = new URL(request.url)
        const id = url.searchParams.get('id')?.trim()
        if (!id) return jsonResponse({ error: '缺少参数 id' }, 400)
        const item = knowledge.getById(id)
        if (!item) return jsonResponse({ error: `未找到条目 ${id}` }, 404)
        const progress = stateStore.getSnapshot().progress[item.id] ?? null
        const crossRefs = knowledge.getCrossRefSummaries(item)
        return jsonResponse({ item, crossRefs, progress })
      },
    },
    {
      path: `${API_PREFIX}/progress`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        const body = (await readJsonBody(request)) as
          | {
              id?: unknown
              status?: unknown
              note?: unknown
              reviewIntervalDays?: unknown
              lastReviewedAt?: unknown
            }
          | undefined
        const id = typeof body?.id === 'string' ? body.id.trim() : ''
        if (!id) return jsonResponse({ error: '缺少有效的条目 id' }, 400)
        const item = knowledge.getById(id)
        if (!item) return jsonResponse({ error: `未找到条目 ${id}` }, 404)

        let status: ItemStatus | undefined
        if (body?.status !== undefined) {
          if (body.status === 'todo' || body.status === 'planned' || body.status === 'done' || body.status === 'skipped') {
            status = body.status
          } else {
            return jsonResponse({ error: '无效的 status 值' }, 400)
          }
        }
        const note = typeof body?.note === 'string' ? body.note : undefined

        let reviewIntervalDays: number | null | undefined
        if (body?.reviewIntervalDays !== undefined) {
          if (body.reviewIntervalDays === null) {
            reviewIntervalDays = null
          } else if (typeof body.reviewIntervalDays === 'number' && Number.isFinite(body.reviewIntervalDays)) {
            reviewIntervalDays = body.reviewIntervalDays
          } else {
            return jsonResponse({ error: '无效的 reviewIntervalDays 值' }, 400)
          }
        }

        let lastReviewedAt: string | null | undefined
        if (body?.lastReviewedAt !== undefined) {
          if (body.lastReviewedAt === null) {
            lastReviewedAt = null
          } else if (typeof body.lastReviewedAt === 'string') {
            lastReviewedAt = body.lastReviewedAt
          } else {
            return jsonResponse({ error: '无效的 lastReviewedAt 值' }, 400)
          }
        }

        const before = computeScoreSummary(
          knowledge.allSummaries,
          stateStore.getSnapshot().progress,
          knowledge.meta.dimensions,
        )
        const dimensionBefore = before.dimensions.find((d) => d.id === item.dimension) ?? null

        const updated = await stateStore.updateItemProgress(id, {
          ...(status !== undefined ? { status } : {}),
          ...(note !== undefined ? { note } : {}),
          ...(reviewIntervalDays !== undefined ? { reviewIntervalDays } : {}),
          ...(lastReviewedAt !== undefined ? { lastReviewedAt } : {}),
        })

        const after = computeScoreSummary(
          knowledge.allSummaries,
          updated.state.progress,
          knowledge.meta.dimensions,
        )
        const dimensionAfter = after.dimensions.find((d) => d.id === item.dimension) ?? null

        const result: ProgressUpdateResult = {
          state: updated.state,
          summary: after,
          xpDelta: after.totalXp - before.totalXp,
          previousStatus: updated.previousStatus,
          currentStatus: updated.currentStatus,
          dimensionBefore,
          dimensionAfter,
        }
        return jsonResponse(result)
      },
    },
    {
      path: `${API_PREFIX}/progress/batch`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        const body = (await readJsonBody(request)) as
          | {
              updates?: unknown
            }
          | undefined
        if (!Array.isArray(body?.updates) || body.updates.length === 0) {
          return jsonResponse({ error: '缺少有效的 updates 批量更新列表' }, 400)
        }
        if (body.updates.length > 500) {
          return jsonResponse({ error: '单次批量更新不能超过 500 条' }, 400)
        }

        const sanitized: Array<{ id: string; status?: ItemStatus; note?: string }> = []
        for (const raw of body.updates) {
          if (typeof raw !== 'object' || raw === null) continue
          const rec = raw as Record<string, unknown>
          const id = typeof rec.id === 'string' ? rec.id.trim() : ''
          if (!id || !knowledge.getById(id)) continue
          let status: ItemStatus | undefined
          if (rec.status !== undefined) {
            if (rec.status === 'todo' || rec.status === 'planned' || rec.status === 'done' || rec.status === 'skipped') {
              status = rec.status
            } else {
              return jsonResponse({ error: `无效的 status 值（条目 ${id}）` }, 400)
            }
          }
          const note = typeof rec.note === 'string' ? rec.note : undefined
          sanitized.push({
            id,
            ...(status !== undefined ? { status } : {}),
            ...(note !== undefined ? { note } : {}),
          })
        }

        if (sanitized.length === 0) {
          return jsonResponse({ error: '未匹配到可更新的有效条目' }, 400)
        }

        const updated = await stateStore.updateItemsProgressBatch(sanitized)
        const summary = computeScoreSummary(
          knowledge.allSummaries,
          updated.state.progress,
          knowledge.meta.dimensions,
        )
        return jsonResponse({
          state: updated.state,
          summary,
          updatedCount: updated.changes.length,
        })
      },
    },
    {
      path: `${API_PREFIX}/profile`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        const body = (await readJsonBody(request)) as UserProfile | undefined
        if (!body || typeof body !== 'object') {
          return jsonResponse({ error: '无效的画像请求体' }, 400)
        }
        const state = await stateStore.updateProfile(body)
        const summary = computeScoreSummary(knowledge.allSummaries, state.progress, knowledge.meta.dimensions)
        const { itemId } = await ensureTodayDailyPick(knowledge, stateStore)
        const pickedFull = itemId ? knowledge.getById(itemId) : undefined
        return jsonResponse({
          state: stateStore.getSnapshot(),
          summary,
          dailyPickItem: pickedFull ? toItemSummary(pickedFull) : null,
        })
      },
    },
    {
      path: `${API_PREFIX}/daily-pick/reroll`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch() {
        const today = todayDateString()
        const state = stateStore.getSnapshot()
        const existing = state.dailyPick
        const history = existing?.date === today ? [...existing.rerollHistory] : []
        if (existing?.itemId && !history.includes(existing.itemId)) {
          history.push(existing.itemId)
        }

        const picked = knowledge.pickDailyItem(
          state.progress,
          state.profile,
          history,
          `${today}#${history.length}#${Date.now()}`,
        )
        if (!picked) {
          return jsonResponse({ dailyPick: existing ?? null, dailyPickItem: null })
        }
        const nextPick: DailyPickState = {
          date: today,
          itemId: picked.id,
          rerollHistory: [...history, picked.id].slice(-40),
        }
        await stateStore.updateDailyPick(nextPick)
        return jsonResponse({
          dailyPick: nextPick,
          dailyPickItem: picked,
        })
      },
    },
    {
      path: `${API_PREFIX}/export-markdown`,
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch() {
        const state = stateStore.getSnapshot()
        const markdown = buildPatchReportMarkdown(knowledge, state)
        const filename = `life-patch-report-${todayDateString()}.md`
        return jsonResponse({ filename, markdown })
      },
    },
    {
      path: `${API_PREFIX}/sync`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch() {
        try {
          const pkgRoot = resolvePackageRoot()
          const scriptPath = path.join(pkgRoot, 'scripts', 'sync-howtolive.mjs')
          const outDir = path.dirname(knowledge.dataPath)
          await execFileAsync(process.execPath, [scriptPath, '--out', outDir], {
            cwd: pkgRoot,
            timeout: 45000,
          })
          await knowledge.reload()
          return jsonResponse({
            ok: true,
            itemCount: knowledge.allItems.length,
            commitSha: knowledge.meta.upstream.commitSha,
          })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          return jsonResponse({ ok: false, error: `同步失败：${message}` }, 500)
        }
      },
    },
  ]
}

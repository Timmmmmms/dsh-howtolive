import type {
  BootstrapPayload,
  DailyPickState,
  HowToLiveState,
  ItemProgress,
  ItemProgressPatch,
  KnowledgeItem,
  KnowledgeItemSummary,
  ProgressUpdateResult,
  ScoreSummary,
  StatePayload,
  UserProfile,
} from '../shared/types.ts'

const API_BASE = 'api/plugins/howtolive'

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const errBody = (await response.json()) as { error?: string }
      if (errBody?.error) detail = errBody.error
    } catch {
      // 忽略非 JSON 错误体
    }
    throw new Error(detail)
  }
  return (await response.json()) as T
}

export interface ItemDetailResponse {
  item: KnowledgeItem
  crossRefs: KnowledgeItemSummary[]
  progress: ItemProgress | null
}

/** 一次性获取引导数据（meta、章节、精简列表、本地进度、评分与今日一抽） */
export function fetchBootstrap(): Promise<BootstrapPayload> {
  return requestJson<BootstrapPayload>(`${API_BASE}/bootstrap`)
}

/** 轻量刷新本地状态、六维评分与今日一抽（不拉取全量条目） */
export function fetchState(): Promise<StatePayload> {
  return requestJson<StatePayload>(`${API_BASE}/state`)
}

/** 导出本地状态 JSON 备份 */
export function fetchStateExport(): Promise<{
  filename: string
  exportedAt: string
  state: HowToLiveState
}> {
  return requestJson(`${API_BASE}/state/export`)
}

/** 导入恢复本地状态 JSON 备份 */
export function postStateImport(payload: HowToLiveState | { state: HowToLiveState }): Promise<
  StatePayload & { ok: boolean; importedAt: string }
> {
  return requestJson(`${API_BASE}/state/import`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** 获取单条建议完整循证详情 */
export function fetchItemDetail(id: string): Promise<ItemDetailResponse> {
  return requestJson<ItemDetailResponse>(`${API_BASE}/item?id=${encodeURIComponent(id)}`)
}

/** 更新条目状态、私有笔记或复检周期 */
export function postItemProgress(
  id: string,
  patch: ItemProgressPatch,
): Promise<ProgressUpdateResult> {
  return requestJson<ProgressUpdateResult>(`${API_BASE}/progress`, {
    method: 'POST',
    body: JSON.stringify({ id, ...patch }),
  })
}

/** 批量更新多条条目进度（单次原子落盘，用于画像智能筛查一键跳过等场景） */
export function postBatchItemProgress(
  updates: ReadonlyArray<{ id: string } & ItemProgressPatch>,
): Promise<{
  state: HowToLiveState
  summary: ScoreSummary
  updatedCount: number
}> {
  return requestJson(`${API_BASE}/progress/batch`, {
    method: 'POST',
    body: JSON.stringify({ updates }),
  })
}

/** 保存本地个人画像 */
export function postUserProfile(profile: UserProfile): Promise<{
  state: HowToLiveState
  summary: ScoreSummary
  dailyPickItem: KnowledgeItemSummary | null
}> {
  return requestJson(`${API_BASE}/profile`, {
    method: 'POST',
    body: JSON.stringify(profile),
  })
}

/** 重抽今日高性价比推荐卡 */
export function postRerollDailyPick(): Promise<{
  dailyPick: DailyPickState | null
  dailyPickItem: KnowledgeItemSummary | null
}> {
  return requestJson(`${API_BASE}/daily-pick/reroll`, { method: 'POST', body: '{}' })
}

/** 导出《我的人生补丁配置单（Markdown）》 */
export function fetchExportMarkdown(): Promise<{ filename: string; markdown: string }> {
  return requestJson(`${API_BASE}/export-markdown`)
}

/** 触发上游知识库同步刷新（Phase 4） */
export function postSyncKnowledge(): Promise<{ ok: boolean; itemCount?: number; message?: string }> {
  return requestJson(`${API_BASE}/sync`, { method: 'POST', body: '{}' })
}

/** 确保人生补丁专属工作区目录存在并返回规范路径 */
export function ensureHowToLiveWorkspaceDir(): Promise<{ path: string; defaultTitle: string }> {
  return requestJson(`${API_BASE}/workspace`, { method: 'POST', body: '{}' })
}

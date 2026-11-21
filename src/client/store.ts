import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { computeScoreSummary } from '../shared/scoring.ts'
import type {
  ChapterInfo,
  HowToLiveState,
  ItemProgress,
  ItemProgressPatch,
  ItemStatus,
  KnowledgeItem,
  KnowledgeItemSummary,
  KnowledgeMeta,
  ProgressUpdateResult,
  ScoreSummary,
  UserProfile,
} from '../shared/types.ts'
import {
  fetchBootstrap,
  fetchExportMarkdown,
  fetchItemDetail,
  fetchState,
  postBatchItemProgress,
  postItemProgress,
  postRerollDailyPick,
  postSyncKnowledge,
  postUserProfile,
} from './api.ts'

export interface HowToLiveViewSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  meta: KnowledgeMeta | null
  chapters: ChapterInfo[]
  items: KnowledgeItemSummary[]
  state: HowToLiveState | null
  summary: ScoreSummary | null
  dailyPickItem: KnowledgeItemSummary | null
  selectedItemId: string | null
  detailHistory: string[]
  detailLoading: boolean
  detailCache: Record<string, { item: KnowledgeItem; crossRefs: KnowledgeItemSummary[] }>
  xpFeedback: { id: string; delta: number; seq: number } | null
  syncing: boolean
}

const INITIAL_SNAPSHOT: HowToLiveViewSnapshot = {
  status: 'idle',
  error: null,
  meta: null,
  chapters: [],
  items: [],
  state: null,
  summary: null,
  dailyPickItem: null,
  selectedItemId: null,
  detailHistory: [],
  detailLoading: false,
  detailCache: {},
  xpFeedback: null,
  syncing: false,
}

export interface HowToLiveClientController {
  readonly store: SnapshotStore<HowToLiveViewSnapshot>
  ensureLoaded(): Promise<void>
  refresh(): Promise<void>
  refreshState(): Promise<void>
  openItemDetail(id: string, options?: { pushHistory?: boolean }): Promise<void>
  goBackItemDetail(): Promise<void>
  closeItemDetail(): void
  setItemProgress(id: string, patch: ItemProgressPatch): Promise<ProgressUpdateResult>
  setItemsProgressBatch(
    updates: ReadonlyArray<{ id: string } & ItemProgressPatch>,
  ): Promise<{ state: HowToLiveState; summary: ScoreSummary; updatedCount: number }>
  saveProfile(profile: UserProfile): Promise<void>
  rerollDaily(): Promise<void>
  exportMarkdown(): Promise<{ filename: string; markdown: string }>
  syncUpstream(): Promise<void>
}

function buildOptimisticProgress(
  prevProgress: Record<string, ItemProgress>,
  id: string,
  patch: ItemProgressPatch,
): Record<string, ItemProgress> {
  const prev = prevProgress[id]
  const currentStatus: ItemStatus = patch.status ?? prev?.status ?? 'todo'
  const nextNote = patch.note !== undefined ? patch.note.trim() : prev?.note
  const nextReviewIntervalDays = patch.reviewIntervalDays !== undefined
    ? (patch.reviewIntervalDays !== null && patch.reviewIntervalDays > 0 ? Math.floor(patch.reviewIntervalDays) : undefined)
    : prev?.reviewIntervalDays
  const nextLastReviewedAt = patch.lastReviewedAt !== undefined
    ? (patch.lastReviewedAt !== null && patch.lastReviewedAt.trim() ? patch.lastReviewedAt.trim() : undefined)
    : prev?.lastReviewedAt

  const next = { ...prevProgress }
  if (
    currentStatus === 'todo'
    && !nextNote
    && nextReviewIntervalDays === undefined
    && nextLastReviewedAt === undefined
  ) {
    delete next[id]
  } else {
    next[id] = {
      status: currentStatus,
      ...(nextNote ? { note: nextNote } : {}),
      ...(nextReviewIntervalDays !== undefined ? { reviewIntervalDays: nextReviewIntervalDays } : {}),
      ...(nextLastReviewedAt !== undefined ? { lastReviewedAt: nextLastReviewedAt } : {}),
      updatedAt: new Date().toISOString(),
    }
  }
  return next
}

/**
 * 创建 Browser 端状态控制器，使用 @deepseek-ai/dsh-client-store 与 Host API 保持同步。
 */
export function createHowToLiveController(): HowToLiveClientController {
  const store = createSnapshotStore<HowToLiveViewSnapshot>(INITIAL_SNAPSHOT)
  let inflightLoad: Promise<void> | null = null
  let inflightStateRefresh: Promise<void> | null = null
  let feedbackSeq = 0

  const refresh = async (): Promise<void> => {
    if (inflightLoad) return inflightLoad
    const prevStatus = store.getSnapshot().status
    if (prevStatus === 'idle' || prevStatus === 'error') {
      store.update((draft) => {
        draft.status = 'loading'
        draft.error = null
      })
    }
    inflightLoad = fetchBootstrap()
      .then((payload) => {
        store.update((draft) => {
          draft.status = 'ready'
          draft.error = null
          draft.meta = payload.meta
          draft.chapters = payload.chapters
          draft.items = payload.items
          draft.state = payload.state
          draft.summary = payload.summary
          draft.dailyPickItem = payload.dailyPickItem
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        store.update((draft) => {
          if (draft.meta === null) {
            draft.status = 'error'
          }
          draft.error = message
        })
      })
      .finally(() => {
        inflightLoad = null
      })
    return inflightLoad
  }

  /** 轻量状态刷新：仅拉取 state + summary + dailyPickItem，避免重复拉取全部 772 条摘要 */
  const refreshState = async (): Promise<void> => {
    const snap = store.getSnapshot()
    if (snap.status !== 'ready' || snap.meta === null) {
      return refresh()
    }
    if (inflightStateRefresh) return inflightStateRefresh
    inflightStateRefresh = fetchState()
      .then((payload) => {
        store.update((draft) => {
          draft.state = payload.state
          draft.summary = payload.summary
          draft.dailyPickItem = payload.dailyPickItem
        })
      })
      .catch(() => {
        // 后台焦点刷新静默忽略瞬时网络错误，不覆盖已有页面状态
      })
      .finally(() => {
        inflightStateRefresh = null
      })
    return inflightStateRefresh
  }

  const ensureLoaded = async (): Promise<void> => {
    const snap = store.getSnapshot()
    if (snap.status === 'ready') return
    await refresh()
  }

  const loadItemDetail = async (id: string): Promise<void> => {
    if (store.getSnapshot().detailCache[id]) return
    try {
      const detail = await fetchItemDetail(id)
      store.update((draft) => {
        draft.detailCache[id] = { item: detail.item, crossRefs: detail.crossRefs }
        if (draft.selectedItemId === id) {
          draft.detailLoading = false
        }
      })
    } catch {
      store.update((draft) => {
        if (draft.selectedItemId === id) {
          draft.detailLoading = false
        }
      })
    }
  }

  const openItemDetail = async (id: string, options?: { pushHistory?: boolean }): Promise<void> => {
    store.update((draft) => {
      if (options?.pushHistory && draft.selectedItemId && draft.selectedItemId !== id) {
        draft.detailHistory.push(draft.selectedItemId)
      } else if (!options?.pushHistory) {
        draft.detailHistory = []
      }
      draft.selectedItemId = id
      draft.detailLoading = !draft.detailCache[id]
    })
    await loadItemDetail(id)
  }

  const goBackItemDetail = async (): Promise<void> => {
    let targetId: string | null = null
    store.update((draft) => {
      const prev = draft.detailHistory.pop()
      if (!prev) return
      targetId = prev
      draft.selectedItemId = prev
      draft.detailLoading = !draft.detailCache[prev]
    })
    if (targetId) {
      await loadItemDetail(targetId)
    }
  }

  const closeItemDetail = (): void => {
    store.update((draft) => {
      draft.selectedItemId = null
      draft.detailHistory = []
      draft.detailLoading = false
    })
  }

  /** 乐观更新条目进度，请求失败时自动回滚至更新前快照并抛出错误 */
  const setItemProgress = async (
    id: string,
    patch: ItemProgressPatch,
  ): Promise<ProgressUpdateResult> => {
    const snapBefore = store.getSnapshot()
    const prevState = snapBefore.state
    const prevSummary = snapBefore.summary

    if (prevState && snapBefore.items.length > 0 && snapBefore.meta) {
      const optimisticProgress = buildOptimisticProgress(prevState.progress, id, patch)
      const optimisticState: HowToLiveState = {
        ...prevState,
        progress: optimisticProgress,
        updatedAt: new Date().toISOString(),
      }
      const optimisticSummary = computeScoreSummary(
        snapBefore.items,
        optimisticProgress,
        snapBefore.meta.dimensions,
      )
      const xpDelta = prevSummary ? optimisticSummary.totalXp - prevSummary.totalXp : 0
      store.update((draft) => {
        draft.state = optimisticState
        draft.summary = optimisticSummary
        if (xpDelta > 0) {
          draft.xpFeedback = { id, delta: xpDelta, seq: ++feedbackSeq }
        }
      })
    }

    try {
      const result = await postItemProgress(id, patch)
      store.update((draft) => {
        draft.state = result.state
        draft.summary = result.summary
        if (result.xpDelta > 0 && draft.xpFeedback?.id !== id) {
          draft.xpFeedback = { id, delta: result.xpDelta, seq: ++feedbackSeq }
        }
      })
      return result
    } catch (err) {
      // 请求失败时自动回滚到乐观更新前的状态
      store.update((draft) => {
        draft.state = prevState
        draft.summary = prevSummary
      })
      throw err
    }
  }

  /** 批量乐观更新多条条目进度（请求失败自动回滚） */
  const setItemsProgressBatch = async (
    updates: ReadonlyArray<{ id: string } & ItemProgressPatch>,
  ): Promise<{ state: HowToLiveState; summary: ScoreSummary; updatedCount: number }> => {
    const snapBefore = store.getSnapshot()
    const prevState = snapBefore.state
    const prevSummary = snapBefore.summary

    if (prevState && snapBefore.items.length > 0 && snapBefore.meta && updates.length > 0) {
      let optimisticProgress = prevState.progress
      for (const entry of updates) {
        const { id, ...patch } = entry
        optimisticProgress = buildOptimisticProgress(optimisticProgress, id, patch)
      }
      const optimisticState: HowToLiveState = {
        ...prevState,
        progress: optimisticProgress,
        updatedAt: new Date().toISOString(),
      }
      const optimisticSummary = computeScoreSummary(
        snapBefore.items,
        optimisticProgress,
        snapBefore.meta.dimensions,
      )
      store.update((draft) => {
        draft.state = optimisticState
        draft.summary = optimisticSummary
      })
    }

    try {
      const result = await postBatchItemProgress(updates)
      store.update((draft) => {
        draft.state = result.state
        draft.summary = result.summary
      })
      return result
    } catch (err) {
      store.update((draft) => {
        draft.state = prevState
        draft.summary = prevSummary
      })
      throw err
    }
  }

  const saveProfile = async (profile: UserProfile): Promise<void> => {
    const result = await postUserProfile(profile)
    store.update((draft) => {
      draft.state = result.state
      draft.summary = result.summary
      draft.dailyPickItem = result.dailyPickItem
    })
  }

  const rerollDaily = async (): Promise<void> => {
    const result = await postRerollDailyPick()
    store.update((draft) => {
      if (draft.state && result.dailyPick) {
        draft.state.dailyPick = result.dailyPick
      }
      draft.dailyPickItem = result.dailyPickItem
    })
  }

  const exportMarkdown = (): Promise<{ filename: string; markdown: string }> => {
    return fetchExportMarkdown()
  }

  const syncUpstream = async (): Promise<void> => {
    store.update((draft) => {
      draft.syncing = true
    })
    try {
      await postSyncKnowledge()
      // 清除详情缓存以读取最新条目内容
      store.update((draft) => {
        draft.detailCache = {}
      })
      await refresh()
    } finally {
      store.update((draft) => {
        draft.syncing = false
      })
    }
  }

  return {
    store,
    ensureLoaded,
    refresh,
    refreshState,
    openItemDetail,
    goBackItemDetail,
    closeItemDetail,
    setItemProgress,
    setItemsProgressBatch,
    saveProfile,
    rerollDaily,
    exportMarkdown,
    syncUpstream,
  }
}

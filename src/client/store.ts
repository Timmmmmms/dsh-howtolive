import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  ChapterInfo,
  HowToLiveState,
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
  detailLoading: false,
  detailCache: {},
  xpFeedback: null,
  syncing: false,
}

export interface HowToLiveClientController {
  readonly store: SnapshotStore<HowToLiveViewSnapshot>
  ensureLoaded(): Promise<void>
  refresh(): Promise<void>
  openItemDetail(id: string): Promise<void>
  closeItemDetail(): void
  setItemProgress(id: string, patch: { status?: ItemStatus; note?: string }): Promise<ProgressUpdateResult>
  saveProfile(profile: UserProfile): Promise<void>
  rerollDaily(): Promise<void>
  exportMarkdown(): Promise<{ filename: string; markdown: string }>
  syncUpstream(): Promise<void>
}

/**
 * 创建 Browser 端状态控制器，使用 @deepseek-ai/dsh-client-store 与 Host API 保持同步。
 */
export function createHowToLiveController(): HowToLiveClientController {
  const store = createSnapshotStore<HowToLiveViewSnapshot>(INITIAL_SNAPSHOT)
  let inflightLoad: Promise<void> | null = null
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

  const ensureLoaded = async (): Promise<void> => {
    const snap = store.getSnapshot()
    if (snap.status === 'ready') return
    await refresh()
  }

  const openItemDetail = async (id: string): Promise<void> => {
    store.update((draft) => {
      draft.selectedItemId = id
      draft.detailLoading = !draft.detailCache[id]
    })
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

  const closeItemDetail = (): void => {
    store.update((draft) => {
      draft.selectedItemId = null
      draft.detailLoading = false
    })
  }

  const setItemProgress = async (
    id: string,
    patch: { status?: ItemStatus; note?: string },
  ): Promise<ProgressUpdateResult> => {
    const result = await postItemProgress(id, patch)
    store.update((draft) => {
      draft.state = result.state
      draft.summary = result.summary
      if (result.xpDelta > 0) {
        draft.xpFeedback = { id, delta: result.xpDelta, seq: ++feedbackSeq }
      }
      // 若今日推荐卡刚好被标记为完成或跳过，则在完成态保留片刻或刷新新卡
      if (
        draft.dailyPickItem?.id === id
        && (result.currentStatus === 'done' || result.currentStatus === 'skipped')
      ) {
        // 交由用户手动换下一张或在下次 refresh 时轮换
      }
    })
    return result
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
    openItemDetail,
    closeItemDetail,
    setItemProgress,
    saveProfile,
    rerollDaily,
    exportMarkdown,
    syncUpstream,
  }
}

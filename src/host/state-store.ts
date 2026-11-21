import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  DailyPickState,
  HowToLiveState,
  ItemProgress,
  ItemProgressPatch,
  ItemStatus,
  UserProfile,
} from '../shared/types.ts'

/** 解析状态文件目录：优先读取 $DSH_HOME，回退 ~/.dsh */
export function resolveStateFilePath(customPath?: string): string {
  if (customPath) return path.resolve(customPath)
  const dshHome = process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh')
  return path.join(dshHome, 'plugins', 'howtolive', 'state.json')
}

function createEmptyState(): HowToLiveState {
  return {
    version: 1,
    profile: {},
    progress: {},
    updatedAt: new Date().toISOString(),
  }
}

function parseReviewInterval(val: unknown): number | undefined {
  if (typeof val !== 'number' || !Number.isFinite(val)) return undefined
  const rounded = Math.floor(val)
  return rounded > 0 ? rounded : undefined
}

function normalizeState(raw: unknown): HowToLiveState {
  if (typeof raw !== 'object' || raw === null) return createEmptyState()
  const obj = raw as Record<string, unknown>
  const profile = typeof obj.profile === 'object' && obj.profile !== null
    ? (obj.profile as UserProfile)
    : {}
  const progress: Record<string, ItemProgress> = {}
  if (typeof obj.progress === 'object' && obj.progress !== null) {
    for (const [id, entry] of Object.entries(obj.progress as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue
      const rec = entry as Record<string, unknown>
      const status = rec.status
      if (status === 'todo' || status === 'planned' || status === 'done' || status === 'skipped') {
        const reviewIntervalDays = parseReviewInterval(rec.reviewIntervalDays)
        const lastReviewedAt = typeof rec.lastReviewedAt === 'string' && rec.lastReviewedAt.trim().length > 0
          ? rec.lastReviewedAt.trim()
          : undefined
        progress[id] = {
          status,
          ...(typeof rec.note === 'string' && rec.note.length > 0 ? { note: rec.note } : {}),
          ...(reviewIntervalDays !== undefined ? { reviewIntervalDays } : {}),
          ...(lastReviewedAt !== undefined ? { lastReviewedAt } : {}),
          updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : new Date().toISOString(),
        }
      }
    }
  }
  const dailyPick = typeof obj.dailyPick === 'object' && obj.dailyPick !== null
    ? (obj.dailyPick as DailyPickState)
    : undefined

  return {
    version: 1,
    profile,
    progress,
    ...(dailyPick ? { dailyPick } : {}),
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
  }
}

/**
 * 本地隐私状态持久化仓库：
 * 使用临时文件 + atomic rename 写入，并通过串行队列避免并发写入竞态。
 */
export class StateStore {
  readonly filePath: string
  private state: HowToLiveState
  private writeQueue: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<(state: HowToLiveState) => void>()

  constructor(filePath?: string) {
    this.filePath = resolveStateFilePath(filePath)
    this.state = createEmptyState()
  }

  /** 同步读取现有状态（插件激活时调用） */
  loadSync(): HowToLiveState {
    if (!existsSync(this.filePath)) {
      this.state = createEmptyState()
      return this.state
    }
    try {
      const raw = readFileSync(this.filePath, 'utf8')
      this.state = normalizeState(JSON.parse(raw))
    } catch {
      // 文件损坏时做兜底备份保护并回退默认状态，不阻断启动
      this.state = createEmptyState()
    }
    return this.state
  }

  /** 异步加载状态 */
  async load(): Promise<HowToLiveState> {
    if (!existsSync(this.filePath)) {
      this.state = createEmptyState()
      return this.state
    }
    try {
      const raw = await readFile(this.filePath, 'utf8')
      this.state = normalizeState(JSON.parse(raw))
    } catch {
      this.state = createEmptyState()
    }
    return this.state
  }

  getSnapshot(): HowToLiveState {
    return this.state
  }

  onChange(listener: (state: HowToLiveState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(this.state)
      } catch {
        // 隔离订阅者异常
      }
    }
  }

  /** 串行原子落盘（临时文件 + rename） */
  private persist(nextState: HowToLiveState): Promise<HowToLiveState> {
    this.state = nextState
    this.emit()

    const payload = JSON.stringify(nextState, null, 2)
    const dir = path.dirname(this.filePath)
    const task = this.writeQueue.then(async () => {
      await mkdir(dir, { recursive: true })
      const tmpPath = path.join(dir, `state.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`)
      await writeFile(tmpPath, payload, 'utf8')
      await rename(tmpPath, this.filePath)
    })
    this.writeQueue = task.catch(() => undefined)
    return task.then(() => nextState)
  }

  /** 同步确保目录存在（供只读场景需要路径时使用） */
  ensureDirSync(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true })
  }

  /** 内部构建单条更新后的 progress 项 */
  private applyProgressPatch(
    nextProgress: Record<string, ItemProgress>,
    itemId: string,
    patch: ItemProgressPatch,
    now: string,
  ): { previousStatus: ItemStatus; currentStatus: ItemStatus } {
    const prev = nextProgress[itemId]
    const previousStatus: ItemStatus = prev?.status ?? 'todo'
    const currentStatus: ItemStatus = patch.status ?? previousStatus
    const nextNote = patch.note !== undefined ? patch.note.trim() : prev?.note

    const nextReviewIntervalDays = patch.reviewIntervalDays !== undefined
      ? (patch.reviewIntervalDays === null ? undefined : parseReviewInterval(patch.reviewIntervalDays))
      : prev?.reviewIntervalDays

    const nextLastReviewedAt = patch.lastReviewedAt !== undefined
      ? (patch.lastReviewedAt === null || !patch.lastReviewedAt.trim() ? undefined : patch.lastReviewedAt.trim())
      : prev?.lastReviewedAt

    if (
      currentStatus === 'todo'
      && !nextNote
      && nextReviewIntervalDays === undefined
      && nextLastReviewedAt === undefined
    ) {
      delete nextProgress[itemId]
    } else {
      nextProgress[itemId] = {
        status: currentStatus,
        ...(nextNote ? { note: nextNote } : {}),
        ...(nextReviewIntervalDays !== undefined ? { reviewIntervalDays: nextReviewIntervalDays } : {}),
        ...(nextLastReviewedAt !== undefined ? { lastReviewedAt: nextLastReviewedAt } : {}),
        updatedAt: now,
      }
    }

    return { previousStatus, currentStatus }
  }

  /** 更新单条条目状态、个人笔记或复检周期 */
  async updateItemProgress(
    itemId: string,
    patch: ItemProgressPatch,
  ): Promise<{ previousStatus: ItemStatus; currentStatus: ItemStatus; state: HowToLiveState }> {
    const now = new Date().toISOString()
    const nextProgress = { ...this.state.progress }
    const { previousStatus, currentStatus } = this.applyProgressPatch(nextProgress, itemId, patch, now)

    const nextState: HowToLiveState = {
      ...this.state,
      progress: nextProgress,
      updatedAt: now,
    }
    await this.persist(nextState)
    return { previousStatus, currentStatus, state: nextState }
  }

  /** 一次性批量更新多条条目进度（单次原子落盘） */
  async updateItemsProgressBatch(
    updates: ReadonlyArray<{ id: string } & ItemProgressPatch>,
  ): Promise<{
    changes: Array<{ id: string; previousStatus: ItemStatus; currentStatus: ItemStatus }>
    state: HowToLiveState
  }> {
    const now = new Date().toISOString()
    const nextProgress = { ...this.state.progress }
    const changes: Array<{ id: string; previousStatus: ItemStatus; currentStatus: ItemStatus }> = []

    for (const entry of updates) {
      const { id, ...patch } = entry
      const { previousStatus, currentStatus } = this.applyProgressPatch(nextProgress, id, patch, now)
      changes.push({ id, previousStatus, currentStatus })
    }

    const nextState: HowToLiveState = {
      ...this.state,
      progress: nextProgress,
      updatedAt: now,
    }
    await this.persist(nextState)
    return { changes, state: nextState }
  }

  /** 导入并恢复完整的本地状态 JSON 备份（自动校验与规范化） */
  async importState(raw: unknown): Promise<HowToLiveState> {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error('无效的状态备份数据：根节点必须是对象')
    }
    const obj = raw as Record<string, unknown>
    if (obj.version !== undefined && obj.version !== 1) {
      throw new Error(`不支持的状态版本号：${String(obj.version)}`)
    }
    if (obj.progress !== undefined && (typeof obj.progress !== 'object' || obj.progress === null || Array.isArray(obj.progress))) {
      throw new Error('无效的状态备份数据：progress 必须是对象')
    }
    if (obj.profile !== undefined && (typeof obj.profile !== 'object' || obj.profile === null || Array.isArray(obj.profile))) {
      throw new Error('无效的状态备份数据：profile 必须是对象')
    }
    const normalized = normalizeState(obj)
    const nextState: HowToLiveState = {
      ...normalized,
      updatedAt: new Date().toISOString(),
    }
    return this.persist(nextState)
  }

  /** 更新本地个人画像 */
  async updateProfile(profile: UserProfile): Promise<HowToLiveState> {
    const now = new Date().toISOString()
    const nextState: HowToLiveState = {
      ...this.state,
      profile: {
        ...profile,
        updatedAt: now,
      },
      updatedAt: now,
    }
    return this.persist(nextState)
  }

  /** 更新今日高性价比一抽状态 */
  async updateDailyPick(dailyPick: DailyPickState): Promise<HowToLiveState> {
    const nextState: HowToLiveState = {
      ...this.state,
      dailyPick,
      updatedAt: new Date().toISOString(),
    }
    return this.persist(nextState)
  }
}

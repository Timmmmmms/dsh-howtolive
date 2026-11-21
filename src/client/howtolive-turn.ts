import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import type {
  ConversationMatch,
  ConversationNodeDefinition,
  TurnLocation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ItemStatus, RoiTier } from '../shared/types.ts'

export const HOWTOLIVE_TOOL_NAMES = new Set([
  'howtolive_search',
  'howtolive_get_item',
  'howtolive_update_item',
  'howtolive_batch_update_items',
])

/** 聊天流内嵌补丁卡片展示的精简条目 */
export interface TurnPatchItem {
  readonly id: string
  readonly title: string
  readonly roiTier: RoiTier
  readonly evidenceGrade: string
  readonly xp: number
  readonly plain: string
  readonly cost: string
  readonly userStatus: ItemStatus
  readonly seq: number
}

export interface HowToLiveTurnData {
  readonly items: readonly TurnPatchItem[]
  readonly hasUpdate: boolean
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** 本轮调用 howtolive 工具检索或更新到的循证补丁条目 */
    'howtolive-patches': HowToLiveTurnData
  }
}

export interface HowToLiveTurnOwner {
  readonly turn: TurnLocation
  readonly seq: number
  readonly openFile: (path: string) => void
}

interface TrackedCall {
  readonly name: string
}

interface HowToLiveTurnState {
  readonly turn: number
  readonly calls: ReadonlyMap<string, TrackedCall>
  readonly items: readonly TurnPatchItem[]
  readonly hasUpdate: boolean
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function asRoiTier(val: unknown): RoiTier {
  if (val === 'S' || val === 'A' || val === 'B' || val === 'C') return val
  return 'B'
}

function asStatus(val: unknown): ItemStatus {
  if (val === 'todo' || val === 'planned' || val === 'done' || val === 'skipped') return val
  return 'todo'
}

function toTurnPatchItem(raw: unknown, seq: number): TurnPatchItem | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null
  return {
    id: raw.id,
    title: raw.title,
    roiTier: asRoiTier(raw.roiTier),
    evidenceGrade: typeof raw.evidenceGrade === 'string' ? raw.evidenceGrade : 'C',
    xp: typeof raw.xp === 'number' ? raw.xp : 15,
    plain: typeof raw.plain === 'string' ? raw.plain : '',
    cost: typeof raw.cost === 'string' ? raw.cost : '',
    userStatus: asStatus(raw.userStatus),
    seq,
  }
}

function extractItemsFromResult(
  toolName: string,
  content: readonly { type: string; text?: string }[],
  seq: number,
): TurnPatchItem[] {
  const first = content[0]
  if (!first || first.type !== 'text' || typeof first.text !== 'string' || !first.text) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(first.text)
  } catch {
    return []
  }
  if (!isRecord(parsed)) return []

  if (toolName === 'howtolive_search' && Array.isArray(parsed.items)) {
    const out: TurnPatchItem[] = []
    for (const entry of parsed.items) {
      const item = toTurnPatchItem(entry, seq)
      if (item) out.push(item)
    }
    return out
  }

  if (toolName === 'howtolive_get_item' && parsed.found === true) {
    const item = toTurnPatchItem(parsed, seq)
    return item ? [item] : []
  }

  return []
}

function mergePatchItems(
  existing: readonly TurnPatchItem[],
  incoming: readonly TurnPatchItem[],
): readonly TurnPatchItem[] {
  if (incoming.length === 0) return existing
  const map = new Map<string, TurnPatchItem>()
  for (const item of existing) map.set(item.id, item)
  for (const item of incoming) {
    if (!map.has(item.id)) map.set(item.id, item)
  }
  return [...map.values()].slice(0, 8)
}

/**
 * 读取指定 Turn 在关闭时刻之前沉淀的 howtolive 补丁卡片数据。
 */
export function selectHowToLivePatches(owner: HowToLiveTurnOwner): HowToLiveTurnData | null {
  const data = owner.turn.data.get('howtolive-patches')
  if (!data) return null
  const boundSeq = owner.turn.end?.seq ?? owner.seq
  const items = data.items.filter((item) => item.seq <= boundSeq)
  if (items.length === 0) return null
  return { items, hasUpdate: data.hasUpdate }
}

/**
 * Turn 级累加器：监听本轮调用的 howtolive_* 工具结果并发布到 Turn 位置索引，
 * 支持实时流与会话日志回放。
 */
export const howtoliveTurnDefinition: ConversationNodeDefinition<HowToLiveTurnState> = {
  kind: 'howtolive-patches',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' }
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event) && 'turn' in event.data) {
      return { id: String(event.data.turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') {
      throw new Error('howtolive-patches start requires turn/start')
    }
    return { turn: match.event.data.turn, calls: new Map(), items: [], hasUpdate: false }
  },
  update: (context, match: ConversationMatch) => {
    if (match.event.type === 'tool/call') {
      if (!HOWTOLIVE_TOOL_NAMES.has(match.event.data.name)) return context.state
      const calls = new Map(context.state.calls)
      calls.set(String(match.event.data.callId), { name: match.event.data.name })
      return { ...context.state, calls }
    }
    if (match.event.type !== 'tool/result') return context.state
    const call = context.state.calls.get(String(match.event.data.message.source.callId))
    if (!call) return context.state
    const message = match.event.data.message
    if (message.isError === true) return context.state

    if (call.name === 'howtolive_update_item' || call.name === 'howtolive_batch_update_items') {
      return { ...context.state, hasUpdate: true }
    }

    const extracted = extractItemsFromResult(
      call.name,
      message.content as readonly { type: string; text?: string }[],
      match.event.seq,
    )
    const nextItems = mergePatchItems(context.state.items, extracted)
    if (nextItems === context.state.items) return context.state
    return { ...context.state, items: nextItems }
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    if (
      previous?.kind === 'turn'
      && previous.turn === context.state.turn
      && previous.key === 'howtolive-patches'
      && previous.value.items === context.state.items
      && previous.value.hasUpdate === context.state.hasUpdate
    ) {
      return previous
    }
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'howtolive-patches',
      value: { items: context.state.items, hasUpdate: context.state.hasUpdate },
    }
  },
}

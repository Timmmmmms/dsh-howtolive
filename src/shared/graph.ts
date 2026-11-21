import { DEFAULT_DIMENSIONS } from './scoring.ts'
import type {
  DimensionId,
  DimensionMeta,
  ItemProgress,
  ItemStatus,
  KnowledgeItemSummary,
  RoiTier,
} from './types.ts'

/** 星图中的单个补丁节点 */
export interface GraphNode {
  readonly id: string
  readonly item: KnowledgeItemSummary
  readonly status: ItemStatus
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly ring: number
  readonly angle: number
  readonly degree: number
  readonly inDegree: number
  readonly outDegree: number
}

/** 星图中的一条有向关联边（source 交叉引用 target） */
export interface GraphEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly crossDimension: boolean
  readonly bothDone: boolean
}

/** 六维放射扇区元信息（用于绘制星区分割线与维度标签） */
export interface GraphSector {
  readonly dimension: DimensionId
  readonly name: string
  readonly startAngle: number
  readonly endAngle: number
  readonly midAngle: number
  readonly labelX: number
  readonly labelY: number
  readonly nodeCount: number
  readonly doneCount: number
}

/** 确定性星图布局结果 */
export interface PatchGraphData {
  readonly width: number
  readonly height: number
  readonly cx: number
  readonly cy: number
  readonly maxRadius: number
  readonly nodes: GraphNode[]
  readonly edges: GraphEdge[]
  readonly sectors: GraphSector[]
  /** 当前展示模式：core 仅展示含关联边的核心骨架；all 展示范围内全部节点 */
  readonly mode: 'core' | 'all'
  /** 传入范围中参与关联的总节点数 */
  readonly connectedCount: number
  /** 传入范围中无关联的孤立节点数 */
  readonly isolatedCount: number
  /** 节点总数 / 边总数 / 已点亮节点数 / 跨维度连线数 */
  readonly stats: {
    readonly nodeCount: number
    readonly edgeCount: number
    readonly doneCount: number
    readonly plannedCount: number
    readonly crossDimensionEdgeCount: number
  }
}

export interface BuildPatchGraphOptions {
  /** 维度过滤（单维度时自动放大该星区布局） */
  readonly dimension?: DimensionId | 'all'
  /** 是否包含无 crossRefs 的孤立节点（默认：全维度下为 false，仅展示核心骨架；单维度下为 false 但可切换） */
  readonly includeIsolated?: boolean
  /** 维度元数据（用于获取名称与顺序） */
  readonly dimensions?: readonly DimensionMeta[]
  /** 画布宽（SVG viewBox） */
  readonly width?: number
  /** 画布高（SVG viewBox） */
  readonly height?: number
  /** 单次渲染最大节点上限，避免极端情况下拥挤 */
  readonly maxNodes?: number
}

const DIMENSION_ORDER: readonly DimensionId[] = [
  'survival',
  'wealth',
  'legal',
  'career',
  'family',
  'resilience',
]

const TIER_RANK: Record<RoiTier, number> = { S: 0, A: 1, B: 2, C: 3 }

function roundCoord(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * 构建「补丁关系星图 / 技能树」的确定性六维放射状布局（纯函数，无随机与物理抖动）：
 * - 基于知识库已有的 `crossRefs` 构建关联网络
 * - 全维度默认仅展示含有效关联边的核心骨架图，避免 772 节点拥挤卡顿
 * - 同维度节点按「性价比 + 连接度」由内向外分层排布在同心圆环上
 */
export function buildPatchGraph(
  items: readonly KnowledgeItemSummary[],
  progressMap: Readonly<Record<string, ItemProgress | undefined>>,
  options: BuildPatchGraphOptions = {},
): PatchGraphData {
  const width = options.width ?? 1040
  const height = options.height ?? 740
  const cx = width / 2
  const cy = height / 2
  const maxRadius = Math.min(width, height) * 0.41
  const minRadius = maxRadius * 0.24
  const maxNodes = options.maxNodes ?? 420
  const activeDimension = options.dimension ?? 'all'
  const dimMetaList = options.dimensions && options.dimensions.length > 0
    ? options.dimensions
    : DEFAULT_DIMENSIONS
  const dimNameMap = new Map<DimensionId, string>(dimMetaList.map((d) => [d.id, d.name]))

  const itemMap = new Map<string, KnowledgeItemSummary>()
  for (const item of items) {
    itemMap.set(item.id, item)
  }

  // 1. 提取所有在当前数据集内有效的有向边（去重且排除自环）
  const rawEdges: Array<{ source: string; target: string }> = []
  const edgeSeen = new Set<string>()
  const inDegreeMap = new Map<string, number>()
  const outDegreeMap = new Map<string, number>()

  for (const item of items) {
    for (const refId of item.crossRefs) {
      if (refId === item.id || !itemMap.has(refId)) continue
      const key = `${item.id}->${refId}`
      if (edgeSeen.has(key)) continue
      edgeSeen.add(key)
      rawEdges.push({ source: item.id, target: refId })
      outDegreeMap.set(item.id, (outDegreeMap.get(item.id) ?? 0) + 1)
      inDegreeMap.set(refId, (inDegreeMap.get(refId) ?? 0) + 1)
    }
  }

  const connectedIds = new Set<string>()
  for (const e of rawEdges) {
    connectedIds.add(e.source)
    connectedIds.add(e.target)
  }

  const connectedCount = connectedIds.size
  const isolatedCount = Math.max(0, items.length - connectedCount)

  // 2. 确定纳入布局的节点集合
  const wantAll = Boolean(options.includeIsolated) || connectedCount === 0
  const mode: 'core' | 'all' = wantAll ? 'all' : 'core'

  const candidateItems = (wantAll
    ? [...items]
    : items.filter((item) => connectedIds.has(item.id)))
    .sort((a, b) => {
      const degA = (inDegreeMap.get(a.id) ?? 0) + (outDegreeMap.get(a.id) ?? 0)
      const degB = (inDegreeMap.get(b.id) ?? 0) + (outDegreeMap.get(b.id) ?? 0)
      return (
        degB - degA
        || TIER_RANK[a.roiTier] - TIER_RANK[b.roiTier]
        || b.roiScore - a.roiScore
        || a.chapterNumber - b.chapterNumber
        || a.number - b.number
      )
    })
    .slice(0, maxNodes)

  const includedIds = new Set(candidateItems.map((i) => i.id))

  // 3. 过滤只保留两端均在 includedIds 内的边
  const edges: GraphEdge[] = []
  let crossDimensionEdgeCount = 0
  for (const e of rawEdges) {
    if (!includedIds.has(e.source) || !includedIds.has(e.target)) continue
    const srcItem = itemMap.get(e.source)!
    const tgtItem = itemMap.get(e.target)!
    const crossDimension = srcItem.dimension !== tgtItem.dimension
    if (crossDimension) crossDimensionEdgeCount++
    const srcDone = (progressMap[e.source]?.status ?? 'todo') === 'done'
    const tgtDone = (progressMap[e.target]?.status ?? 'todo') === 'done'
    edges.push({
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      crossDimension,
      bothDone: srcDone && tgtDone,
    })
  }

  // 4. 按维度分组并计算确定性放射坐标
  const byDim = new Map<DimensionId, KnowledgeItemSummary[]>()
  for (const dim of DIMENSION_ORDER) {
    byDim.set(dim, [])
  }
  for (const item of candidateItems) {
    const list = byDim.get(item.dimension)
    if (list) list.push(item)
  }

  const isSingleDim = activeDimension !== 'all'
  const activeDims: DimensionId[] = isSingleDim ? [activeDimension] : [...DIMENSION_ORDER]
  const sectorSpan = (Math.PI * 2) / activeDims.length
  const baseAngleOffset = -Math.PI / 2 - sectorSpan / 2

  const nodes: GraphNode[] = []
  const sectors: GraphSector[] = []
  let doneCount = 0
  let plannedCount = 0

  activeDims.forEach((dim, dimIndex) => {
    const dimItems = byDim.get(dim) ?? []
    const startAngle = baseAngleOffset + dimIndex * sectorSpan
    const endAngle = startAngle + sectorSpan
    const midAngle = (startAngle + endAngle) / 2

    let sectorDone = 0
    for (const it of dimItems) {
      if ((progressMap[it.id]?.status ?? 'todo') === 'done') sectorDone++
    }

    const labelRadius = maxRadius + (isSingleDim ? 32 : 34)
    sectors.push({
      dimension: dim,
      name: dimNameMap.get(dim) ?? dim,
      startAngle,
      endAngle,
      midAngle,
      labelX: roundCoord(cx + Math.cos(midAngle) * labelRadius),
      labelY: roundCoord(cy + Math.sin(midAngle) * labelRadius),
      nodeCount: dimItems.length,
      doneCount: sectorDone,
    })

    if (dimItems.length === 0) return

    // 同一维度内按「连接度降序 -> S/A/B/C -> 章节顺序」分配到同心环（内环为枢纽/S 级，外环为常规节点）
    const ordered = [...dimItems].sort((a, b) => {
      const degA = (inDegreeMap.get(a.id) ?? 0) + (outDegreeMap.get(a.id) ?? 0)
      const degB = (inDegreeMap.get(b.id) ?? 0) + (outDegreeMap.get(b.id) ?? 0)
      const priorityA = (a.roiTier === 'S' ? 2 : a.roiTier === 'A' ? 1 : 0) + Math.min(degA, 5)
      const priorityB = (b.roiTier === 'S' ? 2 : b.roiTier === 'A' ? 1 : 0) + Math.min(degB, 5)
      return (
        priorityB - priorityA
        || a.chapterNumber - b.chapterNumber
        || a.number - b.number
      )
    })

    // 动态计算同心环数，确保每个环上节点间距舒展
    const baseCap = isSingleDim ? 14 : 6
    const capStep = isSingleDim ? 10 : 4
    const rings: KnowledgeItemSummary[][] = []
    let cursor = 0
    let ringIdx = 0
    while (cursor < ordered.length) {
      const cap = baseCap + ringIdx * capStep
      const slice = ordered.slice(cursor, cursor + cap)
      // 同环内部按章节与编号排序，使相邻章节在角度上自然聚拢
      slice.sort((a, b) => a.chapterNumber - b.chapterNumber || a.number - b.number)
      rings.push(slice)
      cursor += cap
      ringIdx++
    }

    const ringCount = rings.length
    const anglePad = isSingleDim ? 0.04 : Math.min(0.08, sectorSpan * 0.09)
    const usableSpan = isSingleDim ? Math.PI * 2 : Math.max(0.1, sectorSpan - anglePad * 2)

    rings.forEach((ringItems, rIdx) => {
      const t = ringCount === 1 ? 0.45 : rIdx / (ringCount - 1)
      const ringRadius = minRadius + t * (maxRadius - minRadius)
      const countInRing = ringItems.length

      ringItems.forEach((item, idxInRing) => {
        let angle: number
        if (isSingleDim) {
          // 单维度模式下 360° 同心分布，相邻环错开半个步长
          const step = (Math.PI * 2) / Math.max(1, countInRing)
          const stagger = (rIdx % 2) * (step * 0.5)
          angle = -Math.PI / 2 + idxInRing * step + stagger
        } else {
          const frac = countInRing === 1
            ? 0.5
            : (idxInRing + 0.5) / countInRing
          const staggerOffset = countInRing > 1 && rIdx % 2 === 1
            ? (usableSpan / countInRing) * 0.16
            : 0
          angle = startAngle + anglePad + Math.min(1, Math.max(0, frac)) * usableSpan + staggerOffset
          // 钳制在扇区安全边界内
          angle = Math.min(endAngle - anglePad * 0.5, Math.max(startAngle + anglePad * 0.5, angle))
        }

        const inDegree = inDegreeMap.get(item.id) ?? 0
        const outDegree = outDegreeMap.get(item.id) ?? 0
        const degree = inDegree + outDegree
        const status: ItemStatus = progressMap[item.id]?.status ?? 'todo'
        if (status === 'done') doneCount++
        else if (status === 'planned') plannedCount++

        const baseNodeRadius = item.roiTier === 'S' ? 7.2 : item.roiTier === 'A' ? 6.0 : 5.2
        const degreeBonus = Math.min(2.6, degree * 0.45)
        const radius = roundCoord(baseNodeRadius + degreeBonus)

        nodes.push({
          id: item.id,
          item,
          status,
          x: roundCoord(cx + Math.cos(angle) * ringRadius),
          y: roundCoord(cy + Math.sin(angle) * ringRadius),
          radius,
          ring: rIdx,
          angle: roundCoord(angle),
          degree,
          inDegree,
          outDegree,
        })
      })
    })
  })

  return {
    width,
    height,
    cx,
    cy,
    maxRadius: roundCoord(maxRadius),
    nodes,
    edges,
    sectors,
    mode,
    connectedCount,
    isolatedCount,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      doneCount,
      plannedCount,
      crossDimensionEdgeCount,
    },
  }
}

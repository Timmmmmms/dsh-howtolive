import { useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { buildPatchGraph, type GraphNode } from '../../shared/graph.ts'
import type {
  DimensionId,
  DimensionMeta,
  ItemProgress,
  KnowledgeItemSummary,
} from '../../shared/types.ts'
import { IconRotateCcw, IconZoomIn, IconZoomOut } from './Icons.tsx'
import css from './PatchGraphView.module.css'

const MIN_SCALE = 0.55
const MAX_SCALE = 2.8
const ZOOM_STEP = 1.22

export interface PatchGraphViewProps {
  readonly items: readonly KnowledgeItemSummary[]
  readonly progress: Readonly<Record<string, ItemProgress | undefined>>
  readonly dimensions: readonly DimensionMeta[]
  readonly activeDimension: DimensionId | 'all'
  readonly onOpenDetail: (id: string) => void
  readonly t: TranslateNS<'howtolive'>
}

interface ViewportTransform {
  readonly scale: number
  readonly tx: number
  readonly ty: number
}

const INITIAL_VIEWPORT: ViewportTransform = { scale: 1, tx: 0, ty: 0 }

function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(s * 100) / 100))
}

/**
 * 「补丁关系星图 / 技能树」（Skill Tree 视图）：
 * - 纯 SVG 确定性六维放射状布局，无物理引擎抖动
 * - 支持滚轮缩放、指针拖拽平移、缩放重置按钮、hover/键盘焦点高亮上下游连线、点击或回车打开详情抽屉
 */
export function PatchGraphView({
  items,
  progress,
  dimensions,
  activeDimension,
  onOpenDetail,
  t,
}: PatchGraphViewProps) {
  const glowFilterId = useId()
  const [includeIsolated, setIncludeIsolated] = useState(false)
  const [viewport, setViewport] = useState<ViewportTransform>(INITIAL_VIEWPORT)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originTx: number
    originTy: number
    moved: boolean
  } | null>(null)
  const suppressNextClickRef = useRef(false)

  const graph = useMemo(
    () =>
      buildPatchGraph(items, progress, {
        dimension: activeDimension,
        includeIsolated,
        dimensions,
      }),
    [items, progress, activeDimension, includeIsolated, dimensions],
  )

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>()
    for (const node of graph.nodes) {
      map.set(node.id, node)
    }
    return map
  }, [graph.nodes])

  // 计算当前悬停/聚焦节点的上下游关联集合
  const highlighted = useMemo(() => {
    if (!activeNodeId || !nodeMap.has(activeNodeId)) {
      return { nodeIds: null as Set<string> | null, edgeIds: null as Set<string> | null }
    }
    const nodeIds = new Set<string>([activeNodeId])
    const edgeIds = new Set<string>()
    for (const edge of graph.edges) {
      if (edge.source === activeNodeId || edge.target === activeNodeId) {
        edgeIds.add(edge.id)
        nodeIds.add(edge.source)
        nodeIds.add(edge.target)
      }
    }
    return { nodeIds, edgeIds }
  }, [activeNodeId, graph.edges, nodeMap])

  const activeNode = activeNodeId ? (nodeMap.get(activeNodeId) ?? null) : null

  const zoomBy = (factor: number) => {
    setViewport((prev) => {
      const nextScale = clampScale(prev.scale * factor)
      const ratio = nextScale / prev.scale
      // 以画布中心为锚点平滑缩放
      const nextTx = graph.cx - (graph.cx - prev.tx) * ratio
      const nextTy = graph.cy - (graph.cy - prev.ty) * ratio
      return { scale: nextScale, tx: nextTx, ty: nextTy }
    })
  }

  const resetViewport = () => {
    setViewport(INITIAL_VIEWPORT)
  }

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    zoomBy(factor)
  }

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originTx: viewport.tx,
      originTy: viewport.ty,
      moved: false,
    }
    setDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const state = dragStateRef.current
    if (!state || state.pointerId !== e.pointerId) return
    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY
    if (!state.moved && Math.hypot(dx, dy) > 4) {
      state.moved = true
    }
    if (state.moved) {
      setViewport((prev) => ({
        ...prev,
        tx: state.originTx + dx,
        ty: state.originTy + dy,
      }))
    }
  }

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    const state = dragStateRef.current
    if (!state || state.pointerId !== e.pointerId) return
    if (state.moved) {
      suppressNextClickRef.current = true
    }
    dragStateRef.current = null
    setDragging(false)
  }

  const handleNodeActivate = (id: string) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    onOpenDetail(id)
  }

  const orbitRadii = [0.32, 0.56, 0.78, 1.0].map((ratio) => Math.round(graph.maxRadius * ratio))
  const zoomPct = Math.round(viewport.scale * 100)

  return (
    <section className={css.wrap} aria-label={t('graph.title')}>
      <div className={css.toolbar}>
        <div className={css.titleGroup}>
          <div className={css.titleRow}>
            <h2 className={css.title}>{t('graph.title')}</h2>
            <span className={css.statsPill}>
              {t('graph.stats', {
                nodes: graph.stats.nodeCount,
                edges: graph.stats.edgeCount,
                done: graph.stats.doneCount,
              })}
            </span>
          </div>
          <p className={css.subtitle}>{t('graph.subtitle')}</p>
        </div>

        <div className={css.controls}>
          {graph.connectedCount > 0 && graph.isolatedCount > 0 && (
            <div className={css.modeSwitch} role="group" aria-label={t('graph.title')}>
              <button
                type="button"
                className={clsx(css.modeBtn, !includeIsolated && css.modeBtnActive)}
                aria-pressed={!includeIsolated}
                onClick={() => setIncludeIsolated(false)}
              >
                {t('graph.modeCore', { count: graph.connectedCount })}
              </button>
              <button
                type="button"
                className={clsx(css.modeBtn, includeIsolated && css.modeBtnActive)}
                aria-pressed={includeIsolated}
                onClick={() => setIncludeIsolated(true)}
              >
                {t('graph.modeAll', { count: items.length })}
              </button>
            </div>
          )}

          <div className={css.zoomGroup}>
            <button
              type="button"
              className={css.zoomBtn}
              aria-label={t('graph.zoomOut')}
              title={t('graph.zoomOut')}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              <IconZoomOut size={13} />
            </button>
            <span className={css.zoomLabel}>{zoomPct}%</span>
            <button
              type="button"
              className={css.zoomBtn}
              aria-label={t('graph.zoomIn')}
              title={t('graph.zoomIn')}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              <IconZoomIn size={13} />
            </button>
            <button
              type="button"
              className={css.zoomBtn}
              aria-label={t('graph.zoomReset')}
              title={t('graph.zoomReset')}
              onClick={resetViewport}
            >
              <IconRotateCcw size={12} />
              <span>{t('graph.zoomReset')}</span>
            </button>
          </div>
        </div>
      </div>

      {graph.nodes.length === 0 ? (
        <div className={css.emptyCard}>
          <p className={css.emptyTitle}>{t('graph.emptyTitle')}</p>
          <p className={css.emptyDesc}>{t('graph.emptyDesc')}</p>
        </div>
      ) : (
        <div className={css.stageCard}>
          <svg
            className={clsx(css.stageSvg, dragging && css.stageSvgDragging)}
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            role="img"
            aria-label={t('graph.title')}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={() => {
              if (!dragging) setActiveNodeId(null)
            }}
          >
            <defs>
              <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
              {/* 同心星轨背景 */}
              {orbitRadii.map((r) => (
                <circle
                  key={r}
                  cx={graph.cx}
                  cy={graph.cy}
                  r={r}
                  className={css.orbitRing}
                />
              ))}

              {/* 六维扇区分割线与维度标签 */}
              {graph.sectors.map((sec) => {
                const x2 = graph.cx + Math.cos(sec.startAngle) * (graph.maxRadius + 16)
                const y2 = graph.cy + Math.sin(sec.startAngle) * (graph.maxRadius + 16)
                return (
                  <g key={sec.dimension}>
                    {graph.sectors.length > 1 && (
                      <line
                        x1={graph.cx}
                        y1={graph.cy}
                        x2={x2}
                        y2={y2}
                        className={css.sectorAxis}
                      />
                    )}
                    <text
                      x={sec.labelX}
                      y={sec.labelY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={css.sectorLabel}
                    >
                      {sec.name}
                    </text>
                    <text
                      x={sec.labelX}
                      y={sec.labelY + 15}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={css.sectorSub}
                    >
                      {sec.doneCount}/{sec.nodeCount}
                    </text>
                  </g>
                )
              })}

              {/* 关联连线层（使用轻微向心贝塞尔曲线，减少直穿拥挤） */}
              <g>
                {graph.edges.map((edge) => {
                  const src = nodeMap.get(edge.source)
                  const tgt = nodeMap.get(edge.target)
                  if (!src || !tgt) return null

                  const isHighlighted = highlighted.edgeIds?.has(edge.id) ?? false
                  const isDimmed = highlighted.edgeIds !== null && !isHighlighted

                  const midX = (src.x + tgt.x) / 2
                  const midY = (src.y + tgt.y) / 2
                  // 向中心轻微弯曲，让跨维度关联弧线更优雅
                  const bend = edge.crossDimension ? 0.24 : 0.12
                  const ctrlX = midX + (graph.cx - midX) * bend
                  const ctrlY = midY + (graph.cy - midY) * bend

                  return (
                    <path
                      key={edge.id}
                      d={`M ${src.x} ${src.y} Q ${ctrlX} ${ctrlY} ${tgt.x} ${tgt.y}`}
                      className={clsx(
                        css.edge,
                        edge.bothDone && css.edgeBothDone,
                        edge.crossDimension && !edge.bothDone && css.edgeCross,
                        isDimmed && css.edgeDimmed,
                        isHighlighted && (edge.bothDone ? css.edgeHighlightedDone : css.edgeHighlighted),
                      )}
                    />
                  )
                })}
              </g>

              {/* 节点层（支持键盘 Tab 聚焦、Enter/Space 打开详情、Hover 高亮上下游） */}
              <g>
                {graph.nodes.map((node) => {
                  const isActive = activeNodeId === node.id
                  const isConnected = highlighted.nodeIds?.has(node.id) ?? false
                  const isDimmed = highlighted.nodeIds !== null && !isConnected

                  const circleClass =
                    node.status === 'done'
                      ? css.nodeDone
                      : node.status === 'planned'
                        ? css.nodePlanned
                        : node.status === 'skipped'
                          ? css.nodeSkipped
                          : clsx(css.nodeTodo, node.item.roiTier === 'S' && css.nodeTodoTierS)

                  return (
                    <g
                      key={node.id}
                      className={clsx(
                        css.nodeGroup,
                        isActive && css.nodeActive,
                        isDimmed && css.nodeDimmed,
                      )}
                      role="button"
                      tabIndex={0}
                      aria-label={`[${node.id}] ${node.item.title}`}
                      onMouseEnter={() => setActiveNodeId(node.id)}
                      onMouseLeave={() => setActiveNodeId((cur) => (cur === node.id ? null : cur))}
                      onFocus={() => setActiveNodeId(node.id)}
                      onBlur={() => setActiveNodeId((cur) => (cur === node.id ? null : cur))}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleNodeActivate(node.id)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenDetail(node.id)
                        }
                      }}
                    >
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.radius + 3.5}
                        className={css.nodeHalo}
                      />
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isActive ? node.radius + 1.5 : node.radius}
                        className={clsx(css.nodeCircle, circleClass)}
                        filter={node.status === 'done' ? `url(#${glowFilterId})` : undefined}
                      />
                      {(isActive || (isConnected && highlighted.nodeIds !== null && highlighted.nodeIds.size <= 8)) && (
                        <text
                          x={node.x}
                          y={node.y - node.radius - 7}
                          textAnchor="middle"
                          className={css.nodeLabel}
                        >
                          {node.id}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            </g>
          </svg>

          {/* 悬停 / 键盘聚焦节点预览悬浮卡 */}
          {activeNode && (
            <div className={css.previewCard} aria-live="polite">
              <div className={css.previewHead}>
                <span className={css.previewId}>#{activeNode.id}</span>
                <span className={css.previewMeta}>
                  {t('item.tier', { tier: activeNode.item.roiTier })} · {activeNode.item.chapterTitle}
                </span>
              </div>
              <div className={css.previewTitle}>{activeNode.item.title}</div>
              <div className={css.previewPlain}>{activeNode.item.plain}</div>
              <div className={css.previewHint}>
                {t('graph.nodeConnections', {
                  count: activeNode.degree,
                  inCount: activeNode.inDegree,
                  outCount: activeNode.outDegree,
                })} · {t('graph.nodeClickHint')}
              </div>
            </div>
          )}

          {/* 底部图例栏 */}
          <div className={css.legendBar}>
            <div className={css.legendGroup}>
              <span className={css.legendItem}>
                <span className={clsx(css.dot, css.dotDone)} aria-hidden="true" />
                {t('graph.legend.done')}
              </span>
              <span className={css.legendItem}>
                <span className={clsx(css.dot, css.dotPlanned)} aria-hidden="true" />
                {t('graph.legend.planned')}
              </span>
              <span className={css.legendItem}>
                <span className={clsx(css.dot, css.dotTodo)} aria-hidden="true" />
                {t('graph.legend.todo')}
              </span>
              <span className={css.legendItem}>
                <span className={clsx(css.dot, css.dotSkipped)} aria-hidden="true" />
                {t('graph.legend.skipped')}
              </span>
            </div>
            <div className={css.legendGroup}>
              <span className={css.legendItem}>
                <span className={css.lineSampleDone} aria-hidden="true" />
                {t('graph.legend.linkDone')}
              </span>
              <span className={css.legendItem}>
                <span className={css.lineSamplePending} aria-hidden="true" />
                {t('graph.legend.linkPending')}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

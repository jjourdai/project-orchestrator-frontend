/**
 * FsmMiniMap — Lightweight SVG mini-map of a protocol's FSM.
 *
 * Renders states as circles/rectangles and transitions as arrows using pure SVG.
 * Uses dagre for layout (same as FsmViewer) but renders a compact, non-interactive
 * preview suitable for embedding in cards.
 *
 * Lazy-loads the protocol detail (states + transitions) on mount via IntersectionObserver.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import dagre from 'dagre'
import { protocolApi } from '@/services/protocolApi'
import type { ProtocolState, ProtocolTransition } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FsmMiniMapProps {
  protocolId: string
  /** Pre-loaded states (skip fetch if provided) */
  states?: ProtocolState[]
  /** Pre-loaded transitions (skip fetch if provided) */
  transitions?: ProtocolTransition[]
  /** Height of the mini-map */
  height?: number
  className?: string
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const NODE_W = 90
const NODE_H = 30
const NODE_SEP = 30
const RANK_SEP = 50

interface LayoutNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  label: string
  isInitial: boolean
  isTerminal: boolean
  isMacro: boolean
}

interface LayoutEdge {
  id: string
  from: string
  to: string
  label?: string
  points: { x: number; y: number }[]
}

function computeLayout(
  states: ProtocolState[],
  transitions: ProtocolTransition[],
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  if (states.length === 0) return { nodes: [], edges: [], width: 0, height: 0 }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: NODE_SEP, ranksep: RANK_SEP, marginx: 10, marginy: 10 })

  for (const s of states) {
    g.setNode(s.id, { width: NODE_W, height: NODE_H })
  }
  for (const t of transitions) {
    g.setEdge(t.from_state_id, t.to_state_id)
  }

  dagre.layout(g)

  const nodes: LayoutNode[] = states.map((s) => {
    const pos = g.node(s.id)
    return {
      id: s.id,
      x: pos.x,
      y: pos.y,
      w: NODE_W,
      h: NODE_H,
      label: s.name,
      isInitial: s.is_initial,
      isTerminal: s.is_terminal,
      isMacro: !!s.sub_protocol_id,
    }
  })

  const edges: LayoutEdge[] = transitions.map((t) => {
    const edgeData = g.edge(t.from_state_id, t.to_state_id) as { points?: { x: number; y: number }[] }
    return {
      id: t.id,
      from: t.from_state_id,
      to: t.to_state_id,
      label: t.event,
      points: edgeData?.points ?? [],
    }
  })

  const graphInfo = g.graph()
  return {
    nodes,
    edges,
    width: (graphInfo as { width?: number }).width ?? 300,
    height: (graphInfo as { height?: number }).height ?? 100,
  }
}

// ---------------------------------------------------------------------------
// Edge path helper
// ---------------------------------------------------------------------------

function edgePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let d = `M ${points[0].x} ${points[0].y}`
  if (points.length === 2) {
    d += ` L ${points[1].x} ${points[1].y}`
  } else {
    // Use quadratic bezier through intermediate points
    for (let i = 1; i < points.length - 1; i++) {
      const curr = points[i]
      const next = points[i + 1]
      const cx = (curr.x + next.x) / 2
      const cy = (curr.y + next.y) / 2
      d += ` Q ${curr.x} ${curr.y} ${cx} ${cy}`
    }
    const last = points[points.length - 1]
    d += ` L ${last.x} ${last.y}`
  }
  return d
}

// ---------------------------------------------------------------------------
// Color config
// ---------------------------------------------------------------------------

function nodeColors(node: LayoutNode): { fill: string; stroke: string; text: string } {
  if (node.isMacro) return { fill: '#7c3aed15', stroke: '#a78bfa66', text: '#a78bfa' }
  if (node.isInitial) return { fill: '#06b6d415', stroke: '#22d3ee66', text: '#22d3ee' }
  if (node.isTerminal) return { fill: '#22c55e15', stroke: '#4ade8066', text: '#4ade80' }
  return { fill: '#ffffff0a', stroke: '#ffffff1a', text: '#9ca3af' }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FsmMiniMap({
  protocolId,
  states: preloadedStates,
  transitions: preloadedTransitions,
  height = 120,
  className = '',
}: FsmMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Only use preloaded data if states array is actually populated (list endpoint returns undefined)
  const hasPreloaded = preloadedStates && preloadedStates.length > 0
  const [states, setStates] = useState<ProtocolState[] | null>(hasPreloaded ? preloadedStates : null)
  const [transitions, setTransitions] = useState<ProtocolTransition[] | null>(hasPreloaded ? (preloadedTransitions ?? []) : null)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState(false)

  // IntersectionObserver: only fetch when visible
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin: '100px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Fetch protocol detail when visible (if not pre-loaded)
  useEffect(() => {
    if (!visible || states !== null) return

    let cancelled = false
    protocolApi
      .getProtocol(protocolId)
      .then((detail) => {
        if (cancelled) return
        setStates(detail.states ?? [])
        setTransitions(detail.transitions ?? [])
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => { cancelled = true }
  }, [visible, protocolId, states])

  // Compute layout
  const layout = useMemo(() => {
    if (!states || !transitions) return null
    return computeLayout(states, transitions)
  }, [states, transitions])

  // Render
  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height }}>
      {/* Loading shimmer */}
      {!layout && !error && (
        <div className="absolute inset-0 bg-white/[0.02] rounded animate-pulse" />
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-600">
          FSM unavailable
        </div>
      )}

      {/* SVG mini-map */}
      {layout && layout.nodes.length > 0 && (
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id={`arrow-${protocolId.slice(0, 8)}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
            </marker>
          </defs>

          {/* Edges */}
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edgePath(edge.points)}
              fill="none"
              stroke="#4b5563"
              strokeWidth={1}
              markerEnd={`url(#arrow-${protocolId.slice(0, 8)})`}
              opacity={0.6}
            />
          ))}

          {/* Nodes */}
          {layout.nodes.map((node) => {
            const colors = nodeColors(node)
            const rx = node.isTerminal ? 4 : node.isMacro ? 2 : 6

            return (
              <g key={node.id}>
                <rect
                  x={node.x - node.w / 2}
                  y={node.y - node.h / 2}
                  width={node.w}
                  height={node.h}
                  rx={rx}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={node.isMacro ? 1.5 : 1}
                  strokeDasharray={node.isMacro ? '4 2' : undefined}
                />
                <text
                  x={node.x}
                  y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={colors.text}
                  fontSize={9}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={500}
                >
                  {node.label.length > 12 ? node.label.slice(0, 11) + '…' : node.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}

      {/* Empty state */}
      {layout && layout.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-600">
          No states
        </div>
      )}
    </div>
  )
}

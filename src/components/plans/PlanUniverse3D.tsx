// ============================================================================
// PlanUniverse3D — Inline 3D visualization of a plan's ecosystem
// ============================================================================
//
// Force-directed graph centered on the plan, showing tasks, decisions, files,
// commits, constraints. Renders inline within a Card (not fullscreen).
// Right-side detail panel shows node info + connections on click.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import {
  Maximize2, Minimize2, X, FileCode2, GitCommitHorizontal,
  BookOpen, ShieldAlert, StickyNote, Layers, CheckCircle2,
  Circle, ArrowRight,
} from 'lucide-react'

import { usePlanUniverse, type UniverseNode } from './usePlanUniverse'
import { ENTITY_COLORS } from '@/constants/intelligence'

// ── Cached geometries ──────────────────────────────────────────────────────────

const geometryCache = new Map<string, THREE.BufferGeometry>()

const SHAPE_FACTORIES: Record<string, () => THREE.BufferGeometry> = {
  plan: () => new THREE.DodecahedronGeometry(6, 0),
  task: () => new THREE.BoxGeometry(5, 5, 5),
  step: () => new THREE.SphereGeometry(2, 8, 6),
  decision: () => new THREE.TetrahedronGeometry(4.5, 0),
  constraint: () => new THREE.CylinderGeometry(2, 4, 5, 6),
  note: () => new THREE.OctahedronGeometry(4, 0),
  commit: () => new THREE.SphereGeometry(2.5, 8, 6),
  file: () => new THREE.SphereGeometry(3.5, 16, 12),
  function: () => new THREE.IcosahedronGeometry(3, 0),
}

function getGeometry(entityType: string): THREE.BufferGeometry {
  let geo = geometryCache.get(entityType)
  if (!geo) {
    const factory = SHAPE_FACTORIES[entityType] ?? SHAPE_FACTORIES.file
    geo = factory()
    geometryCache.set(entityType, geo)
  }
  return geo
}

// ── Cached materials ─────────────────────────────────────────────────────────

const materialCache = new Map<string, THREE.MeshLambertMaterial>()

function getMaterial(color: string, highlighted = false): THREE.MeshLambertMaterial {
  const key = `${color}-${highlighted}`
  let mat = materialCache.get(key)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: highlighted ? 0.5 : 0.2,
      transparent: true,
      opacity: highlighted ? 1.0 : 0.9,
    })
    materialCache.set(key, mat)
  }
  return mat
}

// ── Link colors by relation type ─────────────────────────────────────────────

const LINK_COLORS: Record<string, string> = {
  HAS_TASK: '#BBF7D0',
  HAS_DECISION: '#8B5CF6',
  AFFECTS: '#3B82F6',
  LINKED_TO: '#84CC16',
  HAS_CONSTRAINT: '#DC2626',
  DEPENDS_ON: '#F59E0B',
  HAS_NOTE: '#F59E0B',
  CONTAINS: '#22C55E',
}

const LINK_LABELS: Record<string, string> = {
  HAS_TASK: 'Has task',
  HAS_DECISION: 'Has decision',
  AFFECTS: 'Affects',
  LINKED_TO: 'Linked to',
  HAS_CONSTRAINT: 'Has constraint',
  DEPENDS_ON: 'Depends on',
  HAS_NOTE: 'Has note',
  CONTAINS: 'Contains',
}

// ── Entity type icons ────────────────────────────────────────────────────────

const ENTITY_ICONS: Record<string, typeof FileCode2> = {
  plan: Layers,
  task: CheckCircle2,
  file: FileCode2,
  decision: BookOpen,
  constraint: ShieldAlert,
  commit: GitCommitHorizontal,
  note: StickyNote,
}

// ── Graph data types ─────────────────────────────────────────────────────────

interface GraphNode extends UniverseNode {
  x?: number
  y?: number
  z?: number
  fx?: number
  fy?: number
  fz?: number
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: string
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

// ── Connection info for detail panel ─────────────────────────────────────────

interface ConnectionInfo {
  node: UniverseNode
  linkType: string
  direction: 'outgoing' | 'incoming'
}

// ── Status badge helper ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: 'bg-gray-800', text: 'text-gray-300', dot: 'bg-gray-400' },
  in_progress: { bg: 'bg-indigo-950', text: 'text-indigo-300', dot: 'bg-indigo-400' },
  blocked: { bg: 'bg-amber-950', text: 'text-amber-300', dot: 'bg-amber-400' },
  completed: { bg: 'bg-green-950', text: 'text-green-300', dot: 'bg-green-400' },
  failed: { bg: 'bg-red-950', text: 'text-red-300', dot: 'bg-red-400' },
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  const c = STATUS_COLORS[s] ?? STATUS_COLORS.pending
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  )
}

// ── Detail Panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  node: UniverseNode
  connections: ConnectionInfo[]
  onClose: () => void
  onNavigate: (nodeId: string) => void
}

function DetailPanel({ node, connections, onClose, onNavigate }: DetailPanelProps) {
  const Icon = ENTITY_ICONS[node.type] ?? Circle
  const data = node.data || {} as Record<string, unknown>
  const status = data.status as string | undefined
  const energy = data.energy as number | undefined
  const stepCount = data.step_count as number | undefined
  const completedStepCount = (data.completed_step_count as number) ?? 0
  const priority = data.priority as number | undefined
  const path = data.path as string | undefined
  const sha = data.sha as string | undefined
  const message = data.message as string | undefined
  const chosenOption = data.chosen_option as string | undefined
  const severity = data.severity as string | undefined

  // Group connections by direction
  const outgoing = connections.filter((c) => c.direction === 'outgoing')
  const incoming = connections.filter((c) => c.direction === 'incoming')

  return (
    <div className="absolute top-0 right-0 h-full w-80 max-w-[45%] z-20 bg-[#0d0d14]/95 backdrop-blur-sm border-l border-white/[0.08] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.08] shrink-0">
        <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: node.color || ENTITY_COLORS[node.type as keyof typeof ENTITY_COLORS] || '#6B7280' }} />
        <span className="text-[10px] uppercase text-gray-500 font-medium">{node.type}</span>
        <button onClick={onClose} className="ml-auto p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Title */}
        <div className="flex items-start gap-2">
          <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-100 break-words leading-snug">{node.label}</h3>
          </div>
        </div>

        {/* Status */}
        {status && (
          <StatusBadge status={status} />
        )}

        {/* Energy */}
        {energy != null && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Energy</span>
            <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${energy * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-400">{(energy * 100).toFixed(0)}%</span>
          </div>
        )}

        {/* Task-specific: Steps */}
        {stepCount != null && stepCount > 0 && (
          <div>
            <h4 className="text-[10px] font-medium text-gray-500 uppercase mb-1.5">
              Steps ({completedStepCount}/{stepCount})
            </h4>
            <div className="h-1 rounded-full bg-white/[0.08] overflow-hidden mb-1.5">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${(completedStepCount / stepCount) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Priority */}
        {priority != null && priority > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Priority</span>
            <span className="text-xs text-gray-300 font-medium">P{priority}</span>
          </div>
        )}

        {/* File path */}
        {path && (
          <div>
            <span className="text-[10px] text-gray-500">Path</span>
            <p className="text-xs text-gray-400 font-mono break-all">{path}</p>
          </div>
        )}

        {/* Commit SHA */}
        {sha && (
          <div>
            <span className="text-[10px] text-gray-500">SHA</span>
            <p className="text-xs text-gray-300 font-mono">{sha.slice(0, 12)}</p>
            {message && (
              <p className="text-xs text-gray-400 mt-0.5">{message}</p>
            )}
          </div>
        )}

        {/* Decision chosen option */}
        {chosenOption && (
          <div>
            <span className="text-[10px] text-gray-500">Chosen</span>
            <p className="text-xs text-green-400 font-medium">{chosenOption}</p>
          </div>
        )}

        {/* Constraint severity */}
        {severity && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Severity</span>
            <span className={`text-xs font-medium ${
              severity === 'must' ? 'text-red-400' :
              severity === 'should' ? 'text-amber-400' :
              'text-gray-400'
            }`}>{severity}</span>
          </div>
        )}

        {/* Connections */}
        {connections.length > 0 && (
          <div className="pt-1 border-t border-white/[0.06]">
            <h4 className="text-[10px] font-medium text-gray-500 uppercase mb-2">
              Connections ({connections.length})
            </h4>

            {/* Outgoing */}
            {outgoing.length > 0 && (
              <div className="mb-2">
                <span className="text-[9px] text-gray-600 uppercase">Outgoing</span>
                <div className="space-y-1 mt-1">
                  {outgoing.map((conn, i) => {
                    return (
                      <button
                        key={`out-${i}`}
                        onClick={() => onNavigate(conn.node.id)}
                        className="w-full flex items-center gap-1.5 py-1 px-1.5 rounded bg-white/[0.03] hover:bg-white/[0.08] transition-colors text-left group"
                      >
                        <ArrowRight className="w-2.5 h-2.5 text-gray-600 shrink-0" />
                        <div
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: conn.node.color || ENTITY_COLORS[conn.node.type as keyof typeof ENTITY_COLORS] || '#6B7280' }}
                        />
                        <span className="text-[10px] text-gray-300 truncate flex-1">{conn.node.label}</span>
                        <span className="text-[8px] text-gray-600 shrink-0">{LINK_LABELS[conn.linkType] ?? conn.linkType}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Incoming */}
            {incoming.length > 0 && (
              <div>
                <span className="text-[9px] text-gray-600 uppercase">Incoming</span>
                <div className="space-y-1 mt-1">
                  {incoming.map((conn, i) => {
                    return (
                      <button
                        key={`in-${i}`}
                        onClick={() => onNavigate(conn.node.id)}
                        className="w-full flex items-center gap-1.5 py-1 px-1.5 rounded bg-white/[0.03] hover:bg-white/[0.08] transition-colors text-left group"
                      >
                        <ArrowRight className="w-2.5 h-2.5 text-gray-600 shrink-0 rotate-180" />
                        <div
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: conn.node.color || ENTITY_COLORS[conn.node.type as keyof typeof ENTITY_COLORS] || '#6B7280' }}
                        />
                        <span className="text-[10px] text-gray-300 truncate flex-1">{conn.node.label}</span>
                        <span className="text-[8px] text-gray-600 shrink-0">{LINK_LABELS[conn.linkType] ?? conn.linkType}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

interface PlanUniverse3DProps {
  planId: string
  planTitle?: string
}

export function PlanUniverse3D({ planId, planTitle }: PlanUniverse3DProps) {
  const { nodes, links, isLoading, error } = usePlanUniverse(planId, planTitle)
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Build node/link lookup maps
  const nodeMap = useMemo(() => {
    const map = new Map<string, UniverseNode>()
    for (const n of nodes) map.set(n.id, n)
    return map
  }, [nodes])

  // Compute connections for selected node
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null
  const selectedConnections = useMemo<ConnectionInfo[]>(() => {
    if (!selectedNodeId) return []
    const conns: ConnectionInfo[] = []
    for (const link of links) {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as unknown as GraphNode).id
      const targetId = typeof link.target === 'string' ? link.target : (link.target as unknown as GraphNode).id
      if (sourceId === selectedNodeId) {
        const targetNode = nodeMap.get(targetId)
        if (targetNode) conns.push({ node: targetNode, linkType: link.type, direction: 'outgoing' })
      }
      if (targetId === selectedNodeId) {
        const sourceNode = nodeMap.get(sourceId)
        if (sourceNode) conns.push({ node: sourceNode, linkType: link.type, direction: 'incoming' })
      }
    }
    return conns
  }, [selectedNodeId, links, nodeMap])

  // Observe container size for responsive rendering
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect
        setDimensions({
          width: Math.max(400, width),
          height: isFullscreen ? window.innerHeight : Math.max(400, Math.min(600, width * 0.6)),
        })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [isFullscreen])

  // Build graph data for react-force-graph-3d
  const graphData: GraphData = useMemo(() => ({
    nodes: nodes.map((n) => ({ ...n })),
    links: links.map((l) => ({ ...l })),
  }), [nodes, links])

  // Zoom to fit after initial layout
  useEffect(() => {
    if (!fgRef.current || nodes.length === 0) return
    const fg = fgRef.current
    const timer = setTimeout(() => {
      fg.zoomToFit(600, 60)
    }, 800)
    return () => clearTimeout(timer)
  }, [nodes])

  // Pin center plan node at origin
  useEffect(() => {
    for (const node of graphData.nodes) {
      if (node.type === 'plan') {
        node.fx = 0
        node.fy = 0
        node.fz = 0
      }
    }
  })

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  // Escape key exits fullscreen or closes detail panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedNodeId) {
          setSelectedNodeId(null)
        } else if (isFullscreen) {
          setIsFullscreen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, selectedNodeId])

  // Custom node renderer — highlight selected node
  const nodeThreeObject = useCallback((node: GraphNode) => {
    const group = new THREE.Group()
    const entityType = node.type
    const color = node.color || ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] || '#6B7280'
    const isSelected = node.id === selectedNodeId

    // Main shape
    const geometry = getGeometry(entityType)
    const material = getMaterial(color, isSelected)
    const mesh = new THREE.Mesh(geometry, material)
    if (entityType === 'plan') mesh.scale.setScalar(1.5)
    if (isSelected) mesh.scale.setScalar(entityType === 'plan' ? 1.8 : 1.3)
    group.add(mesh)

    // Billboard label
    const maxLen = entityType === 'plan' ? 30 : 20
    const text = node.label.length > maxLen ? node.label.slice(0, maxLen - 1) + '\u2026' : node.label
    const sprite = new SpriteText(text)
    sprite.color = isSelected ? '#ffffff' : '#e2e8f0'
    sprite.textHeight = entityType === 'plan' ? 3.5 : 2.5
    sprite.backgroundColor = isSelected ? 'rgba(99, 102, 241, 0.5)' : 'rgba(15, 23, 42, 0.75)'
    sprite.padding = [1.5, 1] as unknown as number
    sprite.borderRadius = 2
    sprite.borderWidth = isSelected ? 0.6 : 0.3
    sprite.borderColor = isSelected ? '#818cf8' : color
    ;(sprite as unknown as THREE.Object3D).position.y = entityType === 'plan' ? -12 : -8
    group.add(sprite)

    // Glow for center plan node or selected node
    if (entityType === 'plan' || isSelected) {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')!
      const glowColor = isSelected ? '#818cf8' : color
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
      gradient.addColorStop(0, `${glowColor}88`)
      gradient.addColorStop(0.4, `${glowColor}44`)
      gradient.addColorStop(1, `${glowColor}00`)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 128, 128)
      const texture = new THREE.CanvasTexture(canvas)
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: isSelected ? 0.9 : 0.7,
        depthWrite: false,
      })
      const glow = new THREE.Sprite(spriteMat)
      glow.scale.set(isSelected ? 25 : 30, isSelected ? 25 : 30, 1)
      group.add(glow)
    }

    return group
  }, [selectedNodeId])

  // Node click handler
  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNodeId((prev) => prev === node.id ? null : node.id)

    // Focus camera on clicked node
    if (fgRef.current && node.x != null && node.y != null && node.z != null) {
      const distance = 80
      const pos = { x: node.x, y: node.y, z: node.z + distance }
      fgRef.current.cameraPosition(pos, { x: node.x, y: node.y, z: node.z }, 600)
    }
  }, [])

  // Navigate to a connected node from the detail panel
  const handleNavigate = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)

    // Find the node to focus on
    const targetNode = graphData.nodes.find((n) => n.id === nodeId)
    if (fgRef.current && targetNode && targetNode.x != null && targetNode.y != null && targetNode.z != null) {
      const distance = 80
      const pos = { x: targetNode.x, y: targetNode.y, z: targetNode.z + distance }
      fgRef.current.cameraPosition(pos, { x: targetNode.x, y: targetNode.y, z: targetNode.z }, 600)
    }
  }, [graphData.nodes])

  // Link color
  const linkColor = useCallback((link: GraphLink) => {
    // Highlight links connected to selected node
    if (selectedNodeId) {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as unknown as GraphNode).id
      const targetId = typeof link.target === 'string' ? link.target : (link.target as unknown as GraphNode).id
      if (sourceId === selectedNodeId || targetId === selectedNodeId) {
        return '#a5b4fc' // bright indigo for selected connections
      }
      return '#1e1e2e' // dim non-selected links
    }
    return LINK_COLORS[link.type] ?? '#4B5563'
  }, [selectedNodeId])

  // Link width
  const linkWidth = useCallback((link: GraphLink) => {
    if (selectedNodeId) {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as unknown as GraphNode).id
      const targetId = typeof link.target === 'string' ? link.target : (link.target as unknown as GraphNode).id
      if (sourceId === selectedNodeId || targetId === selectedNodeId) return 2.5
      return 0.5
    }
    return link.type === 'DEPENDS_ON' ? 2 : link.type === 'HAS_TASK' ? 1.5 : 1
  }, [selectedNodeId])

  // Link directional particles for dependency edges
  const linkParticles = useCallback((link: GraphLink) => {
    return link.type === 'DEPENDS_ON' ? 2 : 0
  }, [])

  // Node hover label
  const nodeLabel = useCallback((node: GraphNode) => {
    const lines = [`<b>${node.label}</b>`, `Type: ${node.type}`]
    const d = node.data
    if (d.status) lines.push(`Status: ${d.status as string}`)
    if (d.path) lines.push(`Path: ${d.path as string}`)
    if (d.sha) lines.push(`SHA: ${(d.sha as string).slice(0, 12)}`)
    if (d.chosen_option) lines.push(`Chosen: ${d.chosen_option as string}`)
    if (d.step_count) lines.push(`Steps: ${d.completed_step_count ?? 0}/${d.step_count}`)
    lines.push('<i style="color:#888">Click for details</i>')
    return lines.join('<br/>')
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="text-gray-400 animate-pulse text-sm">Loading 3D universe...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <p className="text-gray-500 text-sm">No data to visualize</p>
      </div>
    )
  }

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-[#0a0a0f]'
    : 'relative w-full rounded-lg overflow-hidden bg-[#0a0a0f]'

  // Adjust graph width when detail panel is open
  const graphWidth = selectedNode
    ? Math.max(300, (isFullscreen ? window.innerWidth : dimensions.width) - 320)
    : (isFullscreen ? window.innerWidth : dimensions.width)

  return (
    <div ref={containerRef} className={containerClass}>
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2" style={selectedNode ? { right: '21rem' } : undefined}>
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur-sm rounded-lg p-2.5 space-y-1 text-[11px]">
        {[
          { type: 'plan', label: 'Plan (center)' },
          { type: 'task', label: 'Tasks' },
          { type: 'decision', label: 'Decisions' },
          { type: 'constraint', label: 'Constraints' },
          { type: 'file', label: 'Files' },
          { type: 'commit', label: 'Commits' },
        ].map(({ type, label }) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: ENTITY_COLORS[type as keyof typeof ENTITY_COLORS] ?? '#6B7280' }}
            />
            <span className="text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {/* 3D Graph */}
      <ForceGraph3D<GraphNode, GraphLink>
        ref={fgRef}
        graphData={graphData}
        width={graphWidth}
        height={isFullscreen ? window.innerHeight : dimensions.height}
        backgroundColor="#0a0a0f"
        nodeThreeObject={nodeThreeObject}
        nodeLabel={nodeLabel}
        onNodeClick={handleNodeClick}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.6}
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={1.5}
        d3AlphaDecay={0.04}
        d3VelocityDecay={0.3}
        warmupTicks={60}
        cooldownTime={3000}
      />

      {/* Detail Panel */}
      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          connections={selectedConnections}
          onClose={() => setSelectedNodeId(null)}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  )
}

export default PlanUniverse3D

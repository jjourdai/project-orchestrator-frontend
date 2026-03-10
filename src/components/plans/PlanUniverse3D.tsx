// ============================================================================
// PlanUniverse3D — 3D visualization of a plan's ecosystem
// ============================================================================
//
// Rewritten to use the IntelligenceGraph3D architecture:
// - useGraph3DLayout for deterministic, stable positioning (seeded PRNG)
// - nodeObjects.ts for cached geometries/materials (no memory leak)
// - Step progress rings around task nodes
// - Pulse animation for in_progress tasks
// - Proper Three.js resource cleanup on unmount
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import {
  Maximize2, Minimize2, X, FileCode2, GitCommitHorizontal,
  BookOpen, ShieldAlert, StickyNote, Layers, CheckCircle2,
  Circle, ArrowRight, Activity,
} from 'lucide-react'

import { usePlanUniverse, type UniverseNode } from './usePlanUniverse'
import { useGraph3DLayout, type Graph3DNode, type Graph3DLink } from '../intelligence/graph3d/useGraph3DLayout'
import { disposeNodeCaches } from '../intelligence/graph3d/nodeObjects'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'

// ── Cached geometries (shared across all plan instances) ─────────────────────

const planGeoCache = new Map<string, THREE.BufferGeometry>()

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
  let geo = planGeoCache.get(entityType)
  if (!geo) {
    const factory = SHAPE_FACTORIES[entityType] ?? SHAPE_FACTORIES.file
    geo = factory()
    planGeoCache.set(entityType, geo)
  }
  return geo
}

// ── Cached materials (bucketed by color + energy level) ──────────────────────

const planMatCache = new Map<string, THREE.MeshLambertMaterial>()

function getMaterial(color: string, energyBucket: string): THREE.MeshLambertMaterial {
  const key = `${color}:${energyBucket}`
  let mat = planMatCache.get(key)
  if (!mat) {
    const emissiveIntensity = energyBucket === 'high' ? 0.36 : energyBucket === 'mid' ? 0.24 : 0.15
    mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity,
      transparent: true,
      opacity: 0.9,
    })
    planMatCache.set(key, mat)
  }
  return mat
}

// ── Cached glow textures + materials ─────────────────────────────────────────

const glowTexCache = new Map<string, THREE.CanvasTexture>()
const glowMatCache = new Map<string, THREE.SpriteMaterial>()

function createGlowSprite(color: string, energy: number): THREE.Sprite {
  let texture = glowTexCache.get(color)
  if (!texture) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, `${color}88`)
    gradient.addColorStop(0.4, `${color}44`)
    gradient.addColorStop(1, `${color}00`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)
    texture = new THREE.CanvasTexture(canvas)
    glowTexCache.set(color, texture)
  }

  const opacityBucket = Math.round(Math.min(energy, 1.0) * 4) / 4
  const matKey = `${color}:${opacityBucket}`
  let material = glowMatCache.get(matKey)
  if (!material) {
    material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: opacityBucket,
      depthWrite: false,
    })
    glowMatCache.set(matKey, material)
  }

  const sprite = new THREE.Sprite(material)
  const size = 20 + energy * 15
  sprite.scale.set(size, size, 1)
  return sprite
}

// ── Step progress ring geometry (cached per completion bucket) ────────────────

const progressRingCache = new Map<string, THREE.RingGeometry>()
const progressRingMatCache = new Map<string, THREE.MeshBasicMaterial>()

function createProgressRing(completion: number): THREE.Mesh | null {
  if (completion <= 0) return null

  const arc = Math.min(1, completion) * Math.PI * 2
  const bucket = Math.round(completion * 10) / 10 // 10% buckets
  const key = `${bucket}`

  let geo = progressRingCache.get(key)
  if (!geo) {
    geo = new THREE.RingGeometry(4.5, 5.2, 32, 1, 0, arc)
    progressRingCache.set(key, geo)
  }

  const color = completion >= 1 ? '#22C55E' : completion >= 0.5 ? '#3B82F6' : '#F59E0B'
  let mat = progressRingMatCache.get(color)
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    })
    progressRingMatCache.set(color, mat)
  }

  const ring = new THREE.Mesh(geo, mat)
  ring.rotation.x = -Math.PI / 2 // horizontal ring around the task
  return ring
}

// ── Pulse ring for in_progress tasks ─────────────────────────────────────────

const pulseRingGeo = new THREE.RingGeometry(5.5, 6.0, 32)
const pulseRingMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#818CF8'),
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.6,
})

function createPulseRing(): THREE.Mesh {
  return new THREE.Mesh(pulseRingGeo, pulseRingMat)
}

// ── Cleanup all plan-specific caches ─────────────────────────────────────────

function disposePlanCaches() {
  planGeoCache.forEach((geo) => geo.dispose())
  planGeoCache.clear()
  planMatCache.forEach((mat) => mat.dispose())
  planMatCache.clear()
  glowTexCache.forEach((tex) => tex.dispose())
  glowTexCache.clear()
  glowMatCache.forEach((mat) => mat.dispose())
  glowMatCache.clear()
  progressRingCache.forEach((geo) => geo.dispose())
  progressRingCache.clear()
  progressRingMatCache.forEach((mat) => mat.dispose())
  progressRingMatCache.clear()
  pulseRingGeo.dispose()
  pulseRingMat.dispose()
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

// ── Connection info for detail panel ─────────────────────────────────────────

interface ConnectionInfo {
  node: UniverseNode
  linkType: string
  direction: 'outgoing' | 'incoming'
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
          <h3 className="text-sm font-semibold text-gray-100 break-words leading-snug">{node.label}</h3>
        </div>

        {/* Status */}
        {status && <StatusBadge status={status} />}

        {/* Energy */}
        {energy != null && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Energy</span>
            <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${energy * 100}%` }} />
            </div>
            <span className="text-[10px] text-gray-400">{(energy * 100).toFixed(0)}%</span>
          </div>
        )}

        {/* Task-specific: Steps with activity indicator */}
        {stepCount != null && stepCount > 0 && (
          <div>
            <h4 className="text-[10px] font-medium text-gray-500 uppercase mb-1.5 flex items-center gap-1">
              Steps ({completedStepCount}/{stepCount})
              {status === 'in_progress' && <Activity className="w-2.5 h-2.5 text-indigo-400 animate-pulse" />}
            </h4>
            <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden mb-1.5">
              <div
                className={`h-full rounded-full transition-all ${
                  completedStepCount === stepCount ? 'bg-green-500' :
                  status === 'in_progress' ? 'bg-indigo-500 animate-pulse' :
                  'bg-amber-500'
                }`}
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
            {message && <p className="text-xs text-gray-400 mt-0.5">{message}</p>}
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

            {outgoing.length > 0 && (
              <div className="mb-2">
                <span className="text-[9px] text-gray-600 uppercase">Outgoing</span>
                <div className="space-y-1 mt-1">
                  {outgoing.map((conn, i) => (
                    <button
                      key={`out-${i}`}
                      onClick={() => onNavigate(conn.node.id)}
                      className="w-full flex items-center gap-1.5 py-1 px-1.5 rounded bg-white/[0.03] hover:bg-white/[0.08] transition-colors text-left group"
                    >
                      <ArrowRight className="w-2.5 h-2.5 text-gray-600 shrink-0" />
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: conn.node.color || ENTITY_COLORS[conn.node.type as keyof typeof ENTITY_COLORS] || '#6B7280' }} />
                      <span className="text-[10px] text-gray-300 truncate flex-1">{conn.node.label}</span>
                      <span className="text-[8px] text-gray-600 shrink-0">{LINK_LABELS[conn.linkType] ?? conn.linkType}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {incoming.length > 0 && (
              <div>
                <span className="text-[9px] text-gray-600 uppercase">Incoming</span>
                <div className="space-y-1 mt-1">
                  {incoming.map((conn, i) => (
                    <button
                      key={`in-${i}`}
                      onClick={() => onNavigate(conn.node.id)}
                      className="w-full flex items-center gap-1.5 py-1 px-1.5 rounded bg-white/[0.03] hover:bg-white/[0.08] transition-colors text-left group"
                    >
                      <ArrowRight className="w-2.5 h-2.5 text-gray-600 shrink-0 rotate-180" />
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: conn.node.color || ENTITY_COLORS[conn.node.type as keyof typeof ENTITY_COLORS] || '#6B7280' }} />
                      <span className="text-[10px] text-gray-300 truncate flex-1">{conn.node.label}</span>
                      <span className="text-[8px] text-gray-600 shrink-0">{LINK_LABELS[conn.linkType] ?? conn.linkType}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Adapter: UniverseNode/Link → IntelligenceNode/Edge for useGraph3DLayout ──

function toIntelligenceNodes(nodes: UniverseNode[]): IntelligenceNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'default' as const,
    position: { x: 0, y: 0 },
    data: {
      entityType: n.type,
      layer: n.type === 'file' || n.type === 'function' ? 'code' : 'pm',
      label: n.label,
      energy: (n.data.energy as number) ?? 0.5,
      status: n.data.status,
      step_count: n.data.step_count,
      completed_step_count: n.data.completed_step_count,
      priority: n.data.priority,
      path: n.data.path,
      sha: n.data.sha,
      message: n.data.message,
      chosen_option: n.data.chosen_option,
      severity: n.data.severity,
      color: n.color,
    } as Record<string, unknown>,
  })) as unknown as IntelligenceNode[]
}

function toIntelligenceEdges(links: { source: string; target: string; type: string }[]): IntelligenceEdge[] {
  return links.map((l, i) => ({
    id: `e-${i}`,
    source: l.source,
    target: l.target,
    data: {
      relationType: l.type,
      layer: 'pm',
    } as Record<string, unknown>,
  })) as unknown as IntelligenceEdge[]
}

// ── Graph data types ─────────────────────────────────────────────────────────

interface PlanGraphLink {
  source: string | Graph3DNode
  target: string | Graph3DNode
  relationType: string
}

// ── Component ────────────────────────────────────────────────────────────────

interface PlanUniverse3DProps {
  planId: string
  planTitle?: string
}

export function PlanUniverse3D({ planId, planTitle }: PlanUniverse3DProps) {
  const { nodes, links, isLoading, error } = usePlanUniverse(planId, planTitle)
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(undefined)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Track pulse rings for animation
  const pulseRingsRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const animFrameRef = useRef<number>(0)

  // ── Deterministic layout engine ──────────────────────────────────────────
  const { transformToGraph3D, savePositions } = useGraph3DLayout()

  // ── Transform plan data → Graph3D format ─────────────────────────────────
  const { graphData, needsRelayout } = useMemo(() => {
    if (nodes.length === 0) return { graphData: { nodes: [] as Graph3DNode[], links: [] as Graph3DLink[] }, needsRelayout: false }
    const iNodes = toIntelligenceNodes(nodes)
    const iEdges = toIntelligenceEdges(links)
    const { data, needsRelayout: nr } = transformToGraph3D(iNodes, iEdges)
    return { graphData: data, needsRelayout: nr }
  }, [nodes, links, transformToGraph3D])

  // ── Build node/link lookup maps (from original universe data for detail panel) ──
  const nodeMap = useMemo(() => {
    const map = new Map<string, UniverseNode>()
    for (const n of nodes) map.set(n.id, n)
    return map
  }, [nodes])

  // ── Compute connections for selected node ────────────────────────────────
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null
  const selectedConnections = useMemo<ConnectionInfo[]>(() => {
    if (!selectedNodeId) return []
    const conns: ConnectionInfo[] = []
    for (const link of links) {
      if (link.source === selectedNodeId) {
        const targetNode = nodeMap.get(link.target)
        if (targetNode) conns.push({ node: targetNode, linkType: link.type, direction: 'outgoing' })
      }
      if (link.target === selectedNodeId) {
        const sourceNode = nodeMap.get(link.source)
        if (sourceNode) conns.push({ node: sourceNode, linkType: link.type, direction: 'incoming' })
      }
    }
    return conns
  }, [selectedNodeId, links, nodeMap])

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      disposePlanCaches()
      disposeNodeCaches()
      cancelAnimationFrame(animFrameRef.current)
      pulseRingsRef.current.clear()
    }
  }, [])

  // ── Container sizing (robust pattern from IntelligenceGraph3D) ───────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setDimensions((prev) => {
          if (Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1) return prev
          return { width: rect.width, height: rect.height }
        })
      }
    }

    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    measure()

    const onFullscreenChange = () => {
      measure()
      setTimeout(measure, 50)
      setTimeout(measure, 200)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('resize', measure)
    }
  }, [])

  // ── Force renderer resize on fullscreen (>50px delta) ────────────────────
  const prevDimsRef = useRef(dimensions)
  useEffect(() => {
    const prev = prevDimsRef.current
    prevDimsRef.current = dimensions
    const dw = Math.abs(dimensions.width - prev.width)
    const dh = Math.abs(dimensions.height - prev.height)
    if (dw < 50 && dh < 50) return

    const fg = fgRef.current
    if (!fg) return

    const timer = setTimeout(() => {
      try {
        if (typeof fg.renderer === 'function') {
          const renderer = fg.renderer()
          if (renderer) renderer.setSize(dimensions.width, dimensions.height, false)
        }
        if (typeof fg.camera === 'function') {
          const camera = fg.camera()
          if (camera && 'aspect' in camera) {
            camera.aspect = dimensions.width / dimensions.height
            camera.updateProjectionMatrix()
          }
        }
      } catch { /* ForceGraph3D may not be mounted */ }
    }, 100)
    return () => clearTimeout(timer)
  }, [dimensions])

  // ── Pointercancel crash fix (from IntelligenceGraph3D) ───────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handle = (e: PointerEvent) => e.stopPropagation()
    el.addEventListener('pointercancel', handle, true)
    return () => el.removeEventListener('pointercancel', handle, true)
  }, [])

  // ── Simulation control (freeze if no relayout needed) ────────────────────
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || typeof fg.cooldownTicks !== 'function') return
    if (!needsRelayout && graphData.nodes.length > 0) {
      fg.cooldownTicks(0)
    } else {
      fg.cooldownTicks(80)
      fg.cooldownTime?.(3000)
    }
  }, [needsRelayout, graphData])

  // ── Pin plan node at origin ──────────────────────────────────────────────
  useEffect(() => {
    for (const node of graphData.nodes) {
      if (node.entityType === 'plan') {
        node.fx = 0
        node.fy = 0
        node.fz = 0
      }
    }
  }, [graphData.nodes])

  // ── Save positions when simulation stops ─────────────────────────────────
  const onEngineStop = useCallback(() => {
    if (graphData.nodes.length > 0) {
      savePositions(graphData.nodes)
    }
  }, [graphData.nodes, savePositions])

  // ── Zoom to fit after initial layout ─────────────────────────────────────
  useEffect(() => {
    if (!fgRef.current || graphData.nodes.length === 0) return
    const fg = fgRef.current
    const timer = setTimeout(() => fg.zoomToFit(600, 60), 800)
    return () => clearTimeout(timer)
  }, [graphData.nodes.length])

  // ── Pulse animation for in_progress tasks ────────────────────────────────
  useEffect(() => {
    const animate = () => {
      const t = Date.now() * 0.003
      pulseRingsRef.current.forEach((ring) => {
        const scale = 1 + Math.sin(t) * 0.3
        ring.scale.set(scale, scale, 1)
        if (ring.material instanceof THREE.MeshBasicMaterial) {
          ring.material.opacity = 0.3 + Math.sin(t + 1) * 0.2
        }
      })
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  // ── Toggle fullscreen ────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => setIsFullscreen((prev) => !prev), [])

  // ── Escape key ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedNodeId) setSelectedNodeId(null)
        else if (isFullscreen) setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, selectedNodeId])

  // ── Custom node renderer — with progress rings and pulse ─────────────────
  const nodeThreeObject = useCallback((node: Graph3DNode) => {
    const group = new THREE.Group()
    const entityType = node.entityType
    const color = (node.data.color as string) || ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] || '#6B7280'
    const energy = (node.data.energy as number) ?? 0.5
    const isSelected = node.id === selectedNodeId
    const energyBucket = energy > 0.7 ? 'high' : energy > 0.3 ? 'mid' : 'low'

    // Main shape
    const geometry = getGeometry(entityType)
    const material = getMaterial(isSelected ? '#818CF8' : color, isSelected ? 'high' : energyBucket)
    const mesh = new THREE.Mesh(geometry, material)
    if (entityType === 'plan') mesh.scale.setScalar(1.5)
    if (isSelected) mesh.scale.setScalar(entityType === 'plan' ? 1.8 : 1.3)
    group.add(mesh)

    // Billboard label
    const maxLen = entityType === 'plan' ? 30 : 20
    const text = node.label.length > maxLen ? node.label.slice(0, maxLen - 1) + '\u2026' : node.label
    const sprite = new SpriteText(text) as SpriteText & THREE.Object3D
    sprite.color = isSelected ? '#ffffff' : '#e2e8f0'
    sprite.textHeight = entityType === 'plan' ? 3.5 : 2.5
    sprite.backgroundColor = isSelected ? 'rgba(99, 102, 241, 0.5)' : 'rgba(15, 23, 42, 0.75)'
    sprite.padding = [1.5, 1] as unknown as number
    sprite.borderRadius = 2
    sprite.borderWidth = isSelected ? 0.6 : 0.3
    sprite.borderColor = isSelected ? '#818cf8' : color
    ;(sprite as THREE.Object3D).position.y = entityType === 'plan' ? -12 : -8
    group.add(sprite)

    // Glow for center plan node or selected node
    if (entityType === 'plan' || isSelected || energy > 0.7) {
      const glowColor = isSelected ? '#818cf8' : color
      const glow = createGlowSprite(glowColor, isSelected ? 0.9 : energy)
      group.add(glow)
    }

    // Step progress ring (tasks only)
    if (entityType === 'task') {
      const stepCount = node.data.step_count as number | undefined
      const completedSteps = (node.data.completed_step_count as number) ?? 0
      if (stepCount && stepCount > 0) {
        const completion = completedSteps / stepCount
        const ring = createProgressRing(completion)
        if (ring) {
          ring.position.y = 0
          group.add(ring)
        }
      }

      // Pulse ring for in_progress tasks
      const status = node.data.status as string | undefined
      if (status === 'in_progress') {
        const pulse = createPulseRing()
        pulse.rotation.x = -Math.PI / 2
        pulse.position.y = 0
        group.add(pulse)
        pulseRingsRef.current.set(node.id, pulse)
      } else {
        pulseRingsRef.current.delete(node.id)
      }
    }

    return group
  }, [selectedNodeId])

  // ── Node click handler ───────────────────────────────────────────────────
  const handleNodeClick = useCallback((node: Graph3DNode) => {
    setSelectedNodeId((prev) => prev === node.id ? null : node.id)
    if (fgRef.current && node.x != null && node.y != null && node.z != null) {
      const distance = 80
      fgRef.current.cameraPosition(
        { x: node.x, y: node.y, z: node.z + distance },
        { x: node.x, y: node.y, z: node.z },
        600,
      )
    }
  }, [])

  // ── Navigate to connected node from detail panel ─────────────────────────
  const handleNavigate = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    const targetNode = graphData.nodes.find((n) => n.id === nodeId)
    if (fgRef.current && targetNode && targetNode.x != null && targetNode.y != null && targetNode.z != null) {
      const distance = 80
      fgRef.current.cameraPosition(
        { x: targetNode.x, y: targetNode.y, z: targetNode.z + distance },
        { x: targetNode.x, y: targetNode.y, z: targetNode.z },
        600,
      )
    }
  }, [graphData.nodes])

  // ── Link color ───────────────────────────────────────────────────────────
  const linkColor = useCallback((link: PlanGraphLink) => {
    if (selectedNodeId) {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as Graph3DNode).id
      const targetId = typeof link.target === 'string' ? link.target : (link.target as Graph3DNode).id
      if (sourceId === selectedNodeId || targetId === selectedNodeId) return '#a5b4fc'
      return '#1e1e2e'
    }
    return LINK_COLORS[link.relationType] ?? '#4B5563'
  }, [selectedNodeId])

  // ── Link width ───────────────────────────────────────────────────────────
  const linkWidth = useCallback((link: PlanGraphLink) => {
    if (selectedNodeId) {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as Graph3DNode).id
      const targetId = typeof link.target === 'string' ? link.target : (link.target as Graph3DNode).id
      if (sourceId === selectedNodeId || targetId === selectedNodeId) return 2.5
      return 0.5
    }
    return link.relationType === 'DEPENDS_ON' ? 2 : link.relationType === 'HAS_TASK' ? 1.5 : 1
  }, [selectedNodeId])

  // ── Link particles ──────────────────────────────────────────────────────
  const linkParticles = useCallback((link: PlanGraphLink) => {
    return link.relationType === 'DEPENDS_ON' ? 2 : link.relationType === 'HAS_TASK' ? 1 : 0
  }, [])

  // ── Node hover tooltip ───────────────────────────────────────────────────
  const nodeLabel = useCallback((node: Graph3DNode) => {
    const lines = [`<b>${node.label}</b>`, `Type: ${node.entityType}`]
    const d = node.data
    if (d.status) lines.push(`Status: ${d.status as string}`)
    if (d.path) lines.push(`Path: ${d.path as string}`)
    if (d.sha) lines.push(`SHA: ${(d.sha as string).slice(0, 12)}`)
    if (d.chosen_option) lines.push(`Chosen: ${d.chosen_option as string}`)
    if (d.step_count) {
      const pct = Math.round(((d.completed_step_count as number ?? 0) / (d.step_count as number)) * 100)
      lines.push(`Steps: ${d.completed_step_count ?? 0}/${d.step_count} (${pct}%)`)
    }
    lines.push('<i style="color:#888">Click for details</i>')
    return lines.join('<br/>')
  }, [])

  // ── Loading / Error / Empty states ───────────────────────────────────────

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
        {/* Step progress indicator in legend */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.06]">
          <div className="w-2.5 h-2.5 rounded-full border-2 border-indigo-500" />
          <span className="text-gray-400">Step progress</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full border-2 border-indigo-400 animate-pulse" />
          <span className="text-gray-400">Active task</span>
        </div>
      </div>

      {/* 3D Graph */}
      <ForceGraph3D
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
        onEngineStop={onEngineStop}
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

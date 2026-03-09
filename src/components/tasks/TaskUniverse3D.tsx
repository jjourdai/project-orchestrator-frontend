// ============================================================================
// TaskUniverse3D — Immersive 3D visualization of a task's ecosystem
// ============================================================================
//
// Force-directed graph centered on a task, showing steps, decisions, files,
// commits, constraints, notes. Uses react-force-graph-3d with custom
// Three.js shapes from nodeObjects.ts.
// ============================================================================

import { useCallback, useEffect, useRef } from 'react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import { X } from 'lucide-react'

import { useTaskUniverse, type UniverseNode } from './useTaskUniverse'
import { ENTITY_COLORS } from '@/constants/intelligence'

// ── Cached geometries (shared with nodeObjects.ts shape vocabulary) ──────────

const geometryCache = new Map<string, THREE.BufferGeometry>()

const SHAPE_FACTORIES: Record<string, () => THREE.BufferGeometry> = {
  task: () => new THREE.BoxGeometry(6, 6, 6),
  step: () => new THREE.SphereGeometry(2, 8, 6),
  decision: () => new THREE.TetrahedronGeometry(5, 0),
  constraint: () => new THREE.CylinderGeometry(2, 4, 6, 6),
  note: () => new THREE.OctahedronGeometry(4.5, 0),
  commit: () => new THREE.SphereGeometry(2.5, 8, 6),
  file: () => new THREE.SphereGeometry(5, 16, 12),
  function: () => new THREE.IcosahedronGeometry(3.5, 0),
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

// ── Cached materials ────────────────────────────────────────────────────────

const materialCache = new Map<string, THREE.MeshLambertMaterial>()

function getMaterial(color: string): THREE.MeshLambertMaterial {
  let mat = materialCache.get(color)
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.9,
    })
    materialCache.set(color, mat)
  }
  return mat
}

// ── Link colors by relation type ────────────────────────────────────────────

const LINK_COLORS: Record<string, string> = {
  HAS_STEP: '#BBF7D0',
  HAS_DECISION: '#8B5CF6',
  AFFECTS: '#3B82F6',
  LINKED_TO: '#84CC16',
  HAS_CONSTRAINT: '#DC2626',
  HAS_NOTE: '#F59E0B',
  CONTAINS: '#22C55E',
}

// ── Graph data types (react-force-graph-3d expects mutable objects) ──────────

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

// ── Component ───────────────────────────────────────────────────────────────

interface TaskUniverse3DProps {
  taskId: string
  onClose: () => void
}

export function TaskUniverse3D({ taskId, onClose }: TaskUniverse3DProps) {
  const { nodes, links, isLoading, error } = useTaskUniverse(taskId)
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)

  // Build graph data for react-force-graph-3d
  const graphData: GraphData = {
    nodes: nodes.map((n) => ({ ...n })),
    links: links.map((l) => ({ ...l })),
  }

  // Pin the center task node at origin
  useEffect(() => {
    if (!fgRef.current || nodes.length === 0) return
    const fg = fgRef.current

    // Zoom to fit after initial layout
    const timer = setTimeout(() => {
      fg.zoomToFit(600, 60)
    }, 800)

    return () => clearTimeout(timer)
  }, [nodes])

  // Pin center task at origin
  useEffect(() => {
    for (const node of graphData.nodes) {
      if (node.type === 'task') {
        node.fx = 0
        node.fy = 0
        node.fz = 0
      }
    }
  })

  // Custom node renderer
  const nodeThreeObject = useCallback((node: GraphNode) => {
    const group = new THREE.Group()

    const entityType = node.type
    const color = node.color || ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] || '#6B7280'

    // 1. Main shape
    const geometry = getGeometry(entityType)
    const material = getMaterial(color)
    const mesh = new THREE.Mesh(geometry, material)

    // Scale center task larger
    if (entityType === 'task') {
      mesh.scale.setScalar(1.5)
    }

    group.add(mesh)

    // 2. Billboard label
    const maxLen = 22
    const text = node.label.length > maxLen ? node.label.slice(0, maxLen - 1) + '\u2026' : node.label
    const sprite = new SpriteText(text)
    sprite.color = '#e2e8f0'
    sprite.textHeight = entityType === 'task' ? 3.5 : 2.5
    sprite.backgroundColor = 'rgba(15, 23, 42, 0.75)'
    sprite.padding = [1.5, 1] as unknown as number
    sprite.borderRadius = 2
    sprite.borderWidth = 0.3
    sprite.borderColor = color
    ;(sprite as unknown as THREE.Object3D).position.y = entityType === 'task' ? -12 : -8

    group.add(sprite)

    // 3. Glow for center task
    if (entityType === 'task') {
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
      const texture = new THREE.CanvasTexture(canvas)
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      })
      const glow = new THREE.Sprite(spriteMat)
      glow.scale.set(30, 30, 1)
      group.add(glow)
    }

    return group
  }, [])

  // Link color
  const linkColor = useCallback((link: GraphLink) => {
    return LINK_COLORS[link.type] ?? '#4B5563'
  }, [])

  // Link width
  const linkWidth = useCallback((link: GraphLink) => {
    return link.type === 'HAS_STEP' || link.type === 'AFFECTS' ? 1.5 : 1
  }, [])

  // Node hover label
  const nodeLabel = useCallback((node: GraphNode) => {
    const lines = [`<b>${node.label}</b>`, `Type: ${node.type}`]
    const data = node.data
    if (data.status) lines.push(`Status: ${data.status as string}`)
    if (data.path) lines.push(`Path: ${data.path as string}`)
    if (data.sha) lines.push(`SHA: ${(data.sha as string).slice(0, 12)}`)
    if (data.chosen_option) lines.push(`Chosen: ${data.chosen_option as string}`)
    return lines.join('<br/>')
  }, [])

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-gray-400 animate-pulse text-lg">Loading 3D universe...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-white underline">Close</button>
        </div>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gray-500">No data to visualize</p>
          <button onClick={onClose} className="text-gray-400 hover:text-white underline">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-[#0a0a0f]">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[60] p-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
        title="Close 3D view"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Legend */}
      <div className="absolute top-4 left-4 z-[60] bg-black/60 backdrop-blur-sm rounded-lg p-3 space-y-1.5 text-xs">
        <div className="text-gray-400 font-medium mb-2">Entity types</div>
        {[
          { type: 'task', label: 'Task (center)' },
          { type: 'step', label: 'Steps' },
          { type: 'decision', label: 'Decisions' },
          { type: 'file', label: 'Files' },
          { type: 'commit', label: 'Commits' },
        ].map(({ type, label }) => (
          <div key={type} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: ENTITY_COLORS[type as keyof typeof ENTITY_COLORS] ?? '#6B7280' }}
            />
            <span className="text-gray-300">{label}</span>
          </div>
        ))}
      </div>

      {/* 3D Graph */}
      <ForceGraph3D<GraphNode, GraphLink>
        ref={fgRef}
        graphData={graphData}
        backgroundColor="#0a0a0f"
        nodeThreeObject={nodeThreeObject}
        nodeLabel={nodeLabel}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.6}
        linkDirectionalParticles={0}
        d3AlphaDecay={0.04}
        d3VelocityDecay={0.3}
        warmupTicks={60}
        cooldownTime={3000}
      />
    </div>
  )
}

export default TaskUniverse3D

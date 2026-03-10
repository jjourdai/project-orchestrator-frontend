// ============================================================================
// Universe3DPanel — Generic inline 3D visualization panel
// ============================================================================
//
// Renders a force-directed 3D graph inline (not fullscreen) inside a container
// with configurable height. Used across Task, Plan, Milestone, Project pages.
//
// The Three.js / ForceGraph3D imports are heavy, so this entire component
// should be lazy-loaded by the consumer via React.lazy or dynamic import.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import * as THREE from 'three'
import SpriteText from 'three-spritetext'

import { ENTITY_COLORS } from '@/constants/intelligence'
import type { UniverseNode, UniverseLink } from './useEntityUniverse'

// ── Cached geometries ───────────────────────────────────────────────────────

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
  plan: () => new THREE.DodecahedronGeometry(5, 0),
  milestone: () => new THREE.TorusGeometry(4, 1.5, 8, 12),
  project: () => new THREE.OctahedronGeometry(6, 0),
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
  HAS_TASK: '#10B981',
  DEPENDS_ON: '#F59E0B',
  HAS_PLAN: '#10B981',
  HAS_MILESTONE: '#F59E0B',
}

// ── Graph data types ────────────────────────────────────────────────────────

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

// ── Legend item type ────────────────────────────────────────────────────────

interface LegendItem {
  type: string
  label: string
}

// ── Component ───────────────────────────────────────────────────────────────

interface Universe3DPanelProps {
  nodes: UniverseNode[]
  links: UniverseLink[]
  isLoading?: boolean
  error?: string | null
  onClose: () => void
  /** Height in pixels (default 500) */
  height?: number
  /** Center node type — used to determine which node to pin at origin */
  centerType?: string
  /** Legend items to display */
  legend?: LegendItem[]
}

export function Universe3DPanel({
  nodes,
  links,
  isLoading,
  error,
  onClose,
  height = 500,
  centerType = 'task',
  legend,
}: Universe3DPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)
  const [containerWidth, setContainerWidth] = useState(800)

  // Measure container width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerWidth(el.clientWidth)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Build graph data
  const graphData: GraphData = {
    nodes: nodes.map((n) => ({ ...n })),
    links: links.map((l) => ({ ...l })),
  }

  // Pin center node at origin
  useEffect(() => {
    for (const node of graphData.nodes) {
      if (node.type === centerType) {
        node.fx = 0
        node.fy = 0
        node.fz = 0
      }
    }
  })

  // Zoom to fit after initial layout
  useEffect(() => {
    if (!fgRef.current || nodes.length === 0) return
    const fg = fgRef.current
    const timer = setTimeout(() => {
      fg.zoomToFit(600, 60)
    }, 800)
    return () => clearTimeout(timer)
  }, [nodes])

  // Custom node renderer
  const nodeThreeObject = useCallback((node: GraphNode) => {
    const group = new THREE.Group()
    const entityType = node.type
    const color = node.color || ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] || '#6B7280'

    const geometry = getGeometry(entityType)
    const material = getMaterial(color)
    const mesh = new THREE.Mesh(geometry, material)

    // Scale center node larger
    if (entityType === centerType) {
      mesh.scale.setScalar(1.5)
    }

    group.add(mesh)

    // Billboard label
    const maxLen = 22
    const text = node.label.length > maxLen ? node.label.slice(0, maxLen - 1) + '\u2026' : node.label
    const sprite = new SpriteText(text)
    sprite.color = '#e2e8f0'
    sprite.textHeight = entityType === centerType ? 3.5 : 2.5
    sprite.backgroundColor = 'rgba(15, 23, 42, 0.75)'
    sprite.padding = [1.5, 1] as unknown as number
    sprite.borderRadius = 2
    sprite.borderWidth = 0.3
    sprite.borderColor = color
    ;(sprite as unknown as THREE.Object3D).position.y = entityType === centerType ? -12 : -8

    group.add(sprite)

    // Glow for center node
    if (entityType === centerType) {
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
  }, [centerType])

  // Link color
  const linkColor = useCallback((link: GraphLink) => {
    return LINK_COLORS[link.type] ?? '#4B5563'
  }, [])

  // Link width
  const linkWidth = useCallback((link: GraphLink) => {
    return link.type === 'HAS_STEP' || link.type === 'AFFECTS' || link.type === 'DEPENDS_ON' ? 1.5 : 1
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

  // Default legend based on node types in graph
  const legendItems: LegendItem[] = legend ?? Array.from(
    new Set(nodes.map((n) => n.type))
  ).map((type) => ({
    type,
    label: type.charAt(0).toUpperCase() + type.slice(1) + (type === centerType ? ' (center)' : 's'),
  }))

  if (isLoading) {
    return (
      <div
        className="relative rounded-xl bg-[#0a0a0f] flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-gray-400 animate-pulse text-lg">Loading 3D universe...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="relative rounded-xl bg-[#0a0a0f] flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-center space-y-4">
          <p className="text-red-400">{error}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-white underline">Close</button>
        </div>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div
        className="relative rounded-xl bg-[#0a0a0f] flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-center space-y-4">
          <p className="text-gray-500">No data to visualize</p>
          <button onClick={onClose} className="text-gray-400 hover:text-white underline">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl bg-[#0a0a0f] overflow-hidden"
      style={{ height }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
        title="Close 3D view (ESC)"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Legend */}
      <div className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur-sm rounded-lg p-2.5 space-y-1 text-xs">
        <div className="text-gray-400 font-medium mb-1.5">Entity types</div>
        {legendItems.map(({ type, label }) => (
          <div key={type} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: ENTITY_COLORS[type as keyof typeof ENTITY_COLORS] ?? '#6B7280' }}
            />
            <span className="text-gray-300">{label}</span>
          </div>
        ))}
      </div>

      {/* 3D Graph */}
      <ForceGraph3D
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={fgRef as any}
        graphData={graphData}
        width={containerWidth}
        height={height}
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

export default Universe3DPanel

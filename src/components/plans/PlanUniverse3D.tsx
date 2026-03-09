// ============================================================================
// PlanUniverse3D — Inline 3D visualization of a plan's ecosystem
// ============================================================================
//
// Force-directed graph centered on the plan, showing tasks, decisions, files,
// commits, constraints. Renders inline within a Card (not fullscreen).
// Reuses the same Three.js shape vocabulary as TaskUniverse3D.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d'
import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import { Maximize2, Minimize2 } from 'lucide-react'

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
  const graphData: GraphData = {
    nodes: nodes.map((n) => ({ ...n })),
    links: links.map((l) => ({ ...l })),
  }

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

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  // Custom node renderer
  const nodeThreeObject = useCallback((node: GraphNode) => {
    const group = new THREE.Group()
    const entityType = node.type
    const color = node.color || ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] || '#6B7280'

    // Main shape
    const geometry = getGeometry(entityType)
    const material = getMaterial(color)
    const mesh = new THREE.Mesh(geometry, material)
    if (entityType === 'plan') mesh.scale.setScalar(1.5)
    group.add(mesh)

    // Billboard label
    const maxLen = entityType === 'plan' ? 30 : 20
    const text = node.label.length > maxLen ? node.label.slice(0, maxLen - 1) + '\u2026' : node.label
    const sprite = new SpriteText(text)
    sprite.color = '#e2e8f0'
    sprite.textHeight = entityType === 'plan' ? 3.5 : 2.5
    sprite.backgroundColor = 'rgba(15, 23, 42, 0.75)'
    sprite.padding = [1.5, 1] as unknown as number
    sprite.borderRadius = 2
    sprite.borderWidth = 0.3
    sprite.borderColor = color
    ;(sprite as unknown as THREE.Object3D).position.y = entityType === 'plan' ? -12 : -8
    group.add(sprite)

    // Glow for center plan node
    if (entityType === 'plan') {
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
    return link.type === 'DEPENDS_ON' ? 2 : link.type === 'HAS_TASK' ? 1.5 : 1
  }, [])

  // Link directional particles for dependency edges
  const linkParticles = useCallback((link: GraphLink) => {
    return link.type === 'DEPENDS_ON' ? 2 : 0
  }, [])

  // Node hover label
  const nodeLabel = useCallback((node: GraphNode) => {
    const lines = [`<b>${node.label}</b>`, `Type: ${node.type}`]
    const data = node.data
    if (data.status) lines.push(`Status: ${data.status as string}`)
    if (data.path) lines.push(`Path: ${data.path as string}`)
    if (data.sha) lines.push(`SHA: ${(data.sha as string).slice(0, 12)}`)
    if (data.chosen_option) lines.push(`Chosen: ${data.chosen_option as string}`)
    if (data.step_count) lines.push(`Steps: ${data.completed_step_count ?? 0}/${data.step_count}`)
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

  return (
    <div ref={containerRef} className={containerClass}>
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
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
        width={isFullscreen ? window.innerWidth : dimensions.width}
        height={isFullscreen ? window.innerHeight : dimensions.height}
        backgroundColor="#0a0a0f"
        nodeThreeObject={nodeThreeObject}
        nodeLabel={nodeLabel}
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
    </div>
  )
}

export default PlanUniverse3D

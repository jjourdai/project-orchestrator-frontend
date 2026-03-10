// ============================================================================
// PlanUniverse3D — 3D visualization of a plan using IntelligenceGraph3D
// ============================================================================
//
// Thin wrapper that transforms plan data (tasks, decisions, constraints,
// commits, files) into IntelligenceNode/Edge format, then delegates to
// the same IntelligenceGraph3D component used for workspace/project views.
//
// Same engine = same emojis, energy visualization, deterministic layout,
// cached Three.js resources, spreading activation support.
// ============================================================================

import { lazy, Suspense, useEffect, useMemo } from 'react'
import { useSetAtom } from 'jotai'

import { usePlanUniverse } from './usePlanUniverse'
import { selectedNodeIdAtom } from '@/atoms/intelligence'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'

// ── Lazy load the 3D component (heavy Three.js bundle) ─────────────────────
const IntelligenceGraph3D = lazy(() => import('../intelligence/graph3d/IntelligenceGraph3D'))

// ── Status → energy mapping ────────────────────────────────────────────────

function statusToEnergy(status: string | undefined): number {
  switch (status) {
    case 'in_progress': return 0.9
    case 'completed': return 0.4
    case 'blocked': return 0.7
    case 'failed': return 0.2
    case 'pending': return 0.5
    default: return 0.5
  }
}

// ── Adapter: UniverseNode/Link → IntelligenceNode/Edge ─────────────────────

function toIntelligenceNodes(
  nodes: { id: string; label: string; type: string; data: Record<string, unknown>; color: string }[],
): IntelligenceNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'default' as const,
    position: { x: 0, y: 0 },
    data: {
      label: n.label,
      entityType: n.type,
      layer: n.type === 'file' || n.type === 'function' ? 'code' : n.type === 'note' || n.type === 'decision' || n.type === 'constraint' ? 'knowledge' : 'pm',
      entityId: n.id,
      energy: (n.data.energy as number) ?? statusToEnergy(n.data.status as string | undefined),
      // Pass through all data for the NodeInspector
      status: n.data.status,
      step_count: n.data.step_count,
      completed_step_count: n.data.completed_step_count,
      priority: n.data.priority,
      path: n.data.path,
      sha: n.data.sha,
      message: n.data.message,
      chosen_option: n.data.chosen_option,
      severity: n.data.severity,
    } as Record<string, unknown>,
  })) as unknown as IntelligenceNode[]
}

function toIntelligenceEdges(
  links: { source: string; target: string; type: string }[],
): IntelligenceEdge[] {
  return links.map((l, i) => ({
    id: `e-${l.source}-${l.target}-${i}`,
    source: l.source,
    target: l.target,
    data: {
      relationType: l.type,
      layer: 'pm',
    } as Record<string, unknown>,
  })) as unknown as IntelligenceEdge[]
}

// ── Component ────────────────────────────────────────────────────────────────

interface PlanUniverse3DProps {
  planId: string
  planTitle?: string
}

export function PlanUniverse3D({ planId, planTitle }: PlanUniverse3DProps) {
  const { nodes, links, isLoading, error } = usePlanUniverse(planId, planTitle)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)

  // Clear selection when plan changes
  useEffect(() => {
    setSelectedNodeId(null)
  }, [planId, setSelectedNodeId])

  // Transform plan data → IntelligenceNode/Edge format
  const intelligenceNodes = useMemo(() => toIntelligenceNodes(nodes), [nodes])
  const intelligenceEdges = useMemo(() => toIntelligenceEdges(links), [links])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="text-gray-400 animate-pulse text-sm">Loading 3D universe...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <p className="text-gray-500 text-sm">No data to visualize</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-[500px] rounded-lg overflow-hidden bg-[#0a0a0f]">
      <Suspense fallback={
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-400 animate-pulse text-sm">Loading 3D engine...</div>
        </div>
      }>
        <IntelligenceGraph3D
          nodes={intelligenceNodes}
          edges={intelligenceEdges}
        />
      </Suspense>
    </div>
  )
}

export default PlanUniverse3D

// ============================================================================
// usePlanUniverse — Assembles a plan's ecosystem into 3D graph data
// ============================================================================
//
// Builds nodes + links for react-force-graph-3d from the plan's dependency
// graph, decisions, constraints, commits, and affected files.
// Reuses the same UniverseNode / UniverseLink types as useTaskUniverse.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { plansApi } from '@/services'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type {
  DependencyGraph,
  DependencyGraphNode,
  Constraint,
  Decision,
  Commit,
} from '@/types'
import type { UniverseNode, UniverseLink } from '../tasks/useTaskUniverse'

// Re-export for convenience
export type { UniverseNode, UniverseLink }

// ── Status colors ──────────────────────────────────────────────────────────────

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF',     // gray-400
  in_progress: '#3B82F6', // blue-500
  blocked: '#F59E0B',     // amber-500
  completed: '#22C55E',   // green-500
  failed: '#EF4444',      // red-500
}

// ── Build graph from plan data ─────────────────────────────────────────────────

function buildPlanGraph(
  planId: string,
  planTitle: string,
  graph: DependencyGraph,
  constraints: Constraint[],
  decisions: Decision[],
  commits: Commit[],
): { nodes: UniverseNode[]; links: UniverseLink[] } {
  const nodes: UniverseNode[] = []
  const links: UniverseLink[] = []
  const fileNodeIds = new Set<string>()

  // ── Center node: Plan ────────────────────────────────────────────────────────
  nodes.push({
    id: planId,
    label: planTitle,
    type: 'plan',
    data: { energy: 1.0 },
    color: ENTITY_COLORS.plan,
  })

  // ── Task nodes (from dependency graph) ───────────────────────────────────────
  for (const task of graph.nodes || []) {
    const taskColor = TASK_STATUS_COLORS[task.status] ?? ENTITY_COLORS.task
    nodes.push({
      id: task.id,
      label: task.title || task.id.slice(0, 8),
      type: 'task',
      data: {
        status: task.status,
        priority: task.priority,
        step_count: task.step_count,
        completed_step_count: task.completed_step_count,
        energy: task.status === 'in_progress' ? 0.8 : task.status === 'completed' ? 0.3 : 0.5,
      },
      color: taskColor,
    })
    links.push({ source: planId, target: task.id, type: 'HAS_TASK' })

    // Affected files — deduplicated across tasks
    for (const filePath of task.affected_files || []) {
      const fileId = `file:${filePath}`
      if (!fileNodeIds.has(fileId)) {
        fileNodeIds.add(fileId)
        const parts = filePath.split('/')
        const fileName = parts[parts.length - 1] || filePath
        nodes.push({
          id: fileId,
          label: fileName,
          type: 'file',
          data: { path: filePath, energy: 0.3 },
          color: ENTITY_COLORS.file,
        })
      }
      links.push({ source: task.id, target: fileId, type: 'AFFECTS' })
    }
  }

  // ── Task dependency edges ────────────────────────────────────────────────────
  for (const edge of graph.edges || []) {
    links.push({ source: edge.from, target: edge.to, type: 'DEPENDS_ON' })
  }

  // ── Constraints ──────────────────────────────────────────────────────────────
  for (const constraint of constraints) {
    const constraintId = `constraint:${constraint.id}`
    nodes.push({
      id: constraintId,
      label: constraint.description.slice(0, 30),
      type: 'constraint',
      data: { ...constraint, energy: 0.4 },
      color: ENTITY_COLORS.constraint,
    })
    links.push({ source: planId, target: constraintId, type: 'HAS_CONSTRAINT' })
  }

  // ── Decisions ────────────────────────────────────────────────────────────────
  for (const decision of decisions) {
    const decId = `decision:${decision.id}`
    const label = decision.chosen_option
      ? `${decision.description.slice(0, 20)} → ${decision.chosen_option}`
      : decision.description.slice(0, 30)
    nodes.push({
      id: decId,
      label,
      type: 'decision',
      data: { ...decision, energy: 0.5 },
      color: ENTITY_COLORS.decision,
    })
    // Link to the task that owns the decision, or fallback to plan
    const taskId = (decision as unknown as { task_id?: string }).task_id
    const linkTarget = taskId && (graph.nodes || []).some((n) => n.id === taskId) ? taskId : planId
    links.push({ source: linkTarget, target: decId, type: 'HAS_DECISION' })
  }

  // ── Commits ──────────────────────────────────────────────────────────────────
  for (const commit of commits) {
    const commitId = `commit:${commit.sha}`
    nodes.push({
      id: commitId,
      label: commit.sha.slice(0, 7) + (commit.message ? ` ${commit.message.slice(0, 20)}` : ''),
      type: 'commit',
      data: { ...commit, energy: 0.2 },
      color: ENTITY_COLORS.commit,
    })
    links.push({ source: planId, target: commitId, type: 'LINKED_TO' })
  }

  // ── Limit to ~150 nodes ──────────────────────────────────────────────────────
  if (nodes.length > 150) {
    const kept = new Set(nodes.slice(0, 150).map((n) => n.id))
    kept.add(planId) // always keep center
    return {
      nodes: nodes.filter((n) => kept.has(n.id)),
      links: links.filter((l) => kept.has(l.source) && kept.has(l.target)),
    }
  }

  return { nodes, links }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePlanUniverse(planId: string | undefined, planTitle?: string) {
  const [nodes, setNodes] = useState<UniverseNode[]>([])
  const [links, setLinks] = useState<UniverseLink[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUniverse = useCallback(async () => {
    if (!planId) return
    setIsLoading(true)
    setError(null)

    try {
      // Fetch all data in parallel
      const [graphData, constraintsData, commitsData, planResponse] = await Promise.all([
        plansApi.getDependencyGraph(planId).catch(() => null),
        plansApi.listConstraints(planId).catch(() => []),
        plansApi.getCommits(planId).catch(() => ({ items: [] })),
        plansApi.get(planId),
      ])

      if (!graphData || (graphData.nodes || []).length === 0) {
        setNodes([])
        setLinks([])
        return
      }

      const constraints: Constraint[] = Array.isArray(constraintsData) ? constraintsData : []
      const commits: Commit[] = commitsData.items || []

      // Extract decisions from plan details (nested in tasks[].decisions[])
      const rawTasks = (planResponse as unknown as { tasks?: { task?: DependencyGraphNode; decisions?: Decision[] }[] }).tasks || []
      const allDecisions: Decision[] = rawTasks.flatMap((td) => td.decisions || [])

      const title = planTitle || (planResponse as unknown as { plan?: { title?: string } }).plan?.title || 'Plan'

      const result = buildPlanGraph(planId, title, graphData, constraints, allDecisions, commits)
      setNodes(result.nodes)
      setLinks(result.links)
    } catch (err) {
      console.error('Failed to fetch plan universe:', err)
      setError('Failed to load plan universe')
    } finally {
      setIsLoading(false)
    }
  }, [planId, planTitle])

  useEffect(() => {
    fetchUniverse()
  }, [fetchUniverse])

  return { nodes, links, isLoading, error }
}

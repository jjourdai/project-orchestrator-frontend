// ============================================================================
// useTaskUniverse — Assembles a task's ecosystem into 3D graph data
// ============================================================================
//
// Fetches task details (steps, decisions, commits, files) from existing APIs
// and transforms them into nodes + links for react-force-graph-3d.
//
// The backend `GET /api/tasks/{taskId}/universe` endpoint doesn't exist yet,
// so we build the graph from the already-available task detail response.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { tasksApi } from '@/services'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { Task, Step, Decision, Commit, TaskStatus } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────

/** Expected future response from GET /api/tasks/{taskId}/universe */
export interface TaskUniverseData {
  task: {
    id: string
    title: string
    description?: string
    status: TaskStatus
    priority?: number
    tags?: string[]
  }
  steps: { id: string; description: string; status: string; order: number }[]
  constraints: { id: string; description: string; constraint_type: string; severity: string }[]
  decisions: { id: string; description: string; chosen_option?: string; status: string }[]
  affected_files: { path: string; functions?: { name: string; id?: string }[] }[]
  active_agent?: { session_id: string; is_streaming: boolean; cost_usd?: number; elapsed_secs?: number } | null
  commits: { sha: string; message?: string }[]
  notes: { id: string; content: string; note_type: string; importance?: string }[]
}

export interface UniverseNode {
  id: string
  label: string
  type: string // entity type for nodeObjects.ts shape lookup
  data: Record<string, unknown>
  color: string
}

export interface UniverseLink {
  source: string
  target: string
  type: string // relation name
}

// ── Status colors ──────────────────────────────────────────────────────────────

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF',     // gray-400
  in_progress: '#3B82F6', // blue-500
  blocked: '#F59E0B',     // amber-500
  completed: '#22C55E',   // green-500
  failed: '#EF4444',      // red-500
}

const STEP_STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF',
  in_progress: '#3B82F6',
  completed: '#22C55E',
  skipped: '#F59E0B',
}

// ── Build graph from task detail response ──────────────────────────────────────

interface TaskApiResponse {
  task: Task
  steps: Step[]
  decisions: Decision[]
  depends_on: string[]
  modifies_files: string[]
}

function buildGraph(
  task: Task,
  steps: Step[],
  decisions: Decision[],
  commits: Commit[],
): { nodes: UniverseNode[]; links: UniverseLink[] } {
  const nodes: UniverseNode[] = []
  const links: UniverseLink[] = []

  // ── Center node: Task ──────────────────────────────────────────────────────
  const taskColor = TASK_STATUS_COLORS[task.status] ?? ENTITY_COLORS.task
  nodes.push({
    id: task.id,
    label: task.title || task.description.slice(0, 40),
    type: 'task',
    data: { ...task, energy: 0.8 },
    color: taskColor,
  })

  // ── Steps ──────────────────────────────────────────────────────────────────
  for (const step of steps) {
    const stepId = `step:${step.id}`
    nodes.push({
      id: stepId,
      label: `#${step.order} ${step.description.slice(0, 30)}`,
      type: 'step',
      data: { ...step, energy: step.status === 'in_progress' ? 0.6 : 0.2 },
      color: STEP_STATUS_COLORS[step.status] ?? ENTITY_COLORS.step,
    })
    links.push({ source: task.id, target: stepId, type: 'HAS_STEP' })
  }

  // ── Decisions ──────────────────────────────────────────────────────────────
  for (const decision of decisions) {
    const decId = `decision:${decision.id}`
    const label = decision.chosen_option
      ? `${decision.description.slice(0, 20)} → ${decision.chosen_option}`
      : decision.description.slice(0, 30)
    nodes.push({
      id: decId,
      label,
      type: 'decision',
      data: { ...decision, energy: 0.4 },
      color: ENTITY_COLORS.decision,
    })
    links.push({ source: task.id, target: decId, type: 'HAS_DECISION' })
  }

  // ── Affected files & functions ─────────────────────────────────────────────
  const affectedFiles = task.affected_files || []
  for (const filePath of affectedFiles) {
    const fileId = `file:${filePath}`
    // Extract filename for label
    const parts = filePath.split('/')
    const fileName = parts[parts.length - 1] || filePath
    nodes.push({
      id: fileId,
      label: fileName,
      type: 'file',
      data: { path: filePath, energy: 0.3 },
      color: ENTITY_COLORS.file,
    })
    links.push({ source: task.id, target: fileId, type: 'AFFECTS' })
  }

  // ── Commits ────────────────────────────────────────────────────────────────
  for (const commit of commits) {
    const commitId = `commit:${commit.sha}`
    nodes.push({
      id: commitId,
      label: commit.sha.slice(0, 7) + (commit.message ? ` ${commit.message.slice(0, 20)}` : ''),
      type: 'commit',
      data: { ...commit, energy: 0.2 },
      color: ENTITY_COLORS.commit,
    })
    links.push({ source: task.id, target: commitId, type: 'LINKED_TO' })
  }

  // ── Limit to ~100 nodes ────────────────────────────────────────────────────
  if (nodes.length > 100) {
    const kept = new Set(nodes.slice(0, 100).map((n) => n.id))
    kept.add(task.id) // always keep center
    return {
      nodes: nodes.filter((n) => kept.has(n.id)),
      links: links.filter((l) => kept.has(l.source) && kept.has(l.target)),
    }
  }

  return { nodes, links }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTaskUniverse(taskId: string | undefined) {
  const [nodes, setNodes] = useState<UniverseNode[]>([])
  const [links, setLinks] = useState<UniverseLink[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUniverse = useCallback(async () => {
    if (!taskId) return
    setIsLoading(true)
    setError(null)

    try {
      // Assemble from existing APIs
      const response = await tasksApi.get(taskId) as unknown as TaskApiResponse
      const taskData = response.task || response
      const steps = response.steps || []
      const decisions = response.decisions || []

      // Fetch commits separately (may fail gracefully)
      let commits: Commit[] = []
      try {
        const commitsData = await tasksApi.getCommits(taskId)
        commits = commitsData.items || []
      } catch {
        // graceful degradation
      }

      const graph = buildGraph(taskData, steps, decisions, commits)
      setNodes(graph.nodes)
      setLinks(graph.links)
    } catch (err) {
      console.error('Failed to fetch task universe:', err)
      setError('Failed to load task universe')
    } finally {
      setIsLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    fetchUniverse()
  }, [fetchUniverse])

  return { nodes, links, isLoading, error }
}

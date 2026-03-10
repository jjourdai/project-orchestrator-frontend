// ============================================================================
// useEntityUniverse — Hooks for building 3D graph data at each entity level
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { tasksApi, plansApi, projectsApi } from '@/services'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { Task, Step, Decision, Commit, Plan } from '@/types'

// ── Shared types ────────────────────────────────────────────────────────────

export interface UniverseNode {
  id: string
  label: string
  type: string
  data: Record<string, unknown>
  color: string
}

export interface UniverseLink {
  source: string
  target: string
  type: string
}

interface UniverseResult {
  nodes: UniverseNode[]
  links: UniverseLink[]
  isLoading: boolean
  error: string | null
}

// ── Status colors ───────────────────────────────────────────────────────────

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF',
  in_progress: '#3B82F6',
  blocked: '#F59E0B',
  completed: '#22C55E',
  failed: '#EF4444',
}

const STEP_STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF',
  in_progress: '#3B82F6',
  completed: '#22C55E',
  skipped: '#F59E0B',
}

const PLAN_STATUS_COLORS: Record<string, string> = {
  draft: '#9CA3AF',
  approved: '#3B82F6',
  in_progress: '#8B5CF6',
  completed: '#22C55E',
  cancelled: '#EF4444',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function limitNodes(
  nodes: UniverseNode[],
  links: UniverseLink[],
  centerId: string,
  max = 100,
): { nodes: UniverseNode[]; links: UniverseLink[] } {
  if (nodes.length <= max) return { nodes, links }
  const kept = new Set(nodes.slice(0, max).map((n) => n.id))
  kept.add(centerId)
  return {
    nodes: nodes.filter((n) => kept.has(n.id)),
    links: links.filter((l) => kept.has(l.source) && kept.has(l.target)),
  }
}

// ── useTaskUniverse ─────────────────────────────────────────────────────────

interface TaskApiResponse {
  task: Task
  steps: Step[]
  decisions: Decision[]
  depends_on: string[]
  modifies_files: string[]
}

export function useTaskUniverse(taskId: string | undefined): UniverseResult {
  const [nodes, setNodes] = useState<UniverseNode[]>([])
  const [links, setLinks] = useState<UniverseLink[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUniverse = useCallback(async () => {
    if (!taskId) return
    setIsLoading(true)
    setError(null)

    try {
      const response = await tasksApi.get(taskId) as unknown as TaskApiResponse
      const task = response.task || response
      const steps = response.steps || []
      const decisions = response.decisions || []

      let commits: Commit[] = []
      try {
        const commitsData = await tasksApi.getCommits(taskId)
        commits = commitsData.items || []
      } catch { /* graceful degradation */ }

      const n: UniverseNode[] = []
      const l: UniverseLink[] = []

      // Center: Task
      const taskColor = TASK_STATUS_COLORS[task.status] ?? ENTITY_COLORS.task
      n.push({
        id: task.id,
        label: task.title || task.description.slice(0, 40),
        type: 'task',
        data: { ...task, energy: 0.8 },
        color: taskColor,
      })

      // Steps
      for (const step of steps) {
        const stepId = `step:${step.id}`
        n.push({
          id: stepId,
          label: `#${step.order} ${step.description.slice(0, 30)}`,
          type: 'step',
          data: { ...step, energy: step.status === 'in_progress' ? 0.6 : 0.2 },
          color: STEP_STATUS_COLORS[step.status] ?? ENTITY_COLORS.step,
        })
        l.push({ source: task.id, target: stepId, type: 'HAS_STEP' })
      }

      // Decisions
      for (const decision of decisions) {
        const decId = `decision:${decision.id}`
        const label = decision.chosen_option
          ? `${decision.description.slice(0, 20)} \u2192 ${decision.chosen_option}`
          : decision.description.slice(0, 30)
        n.push({
          id: decId,
          label,
          type: 'decision',
          data: { ...decision, energy: 0.4 },
          color: ENTITY_COLORS.decision,
        })
        l.push({ source: task.id, target: decId, type: 'HAS_DECISION' })
      }

      // Affected files
      const affectedFiles = task.affected_files || []
      for (const filePath of affectedFiles) {
        const fileId = `file:${filePath}`
        const parts = filePath.split('/')
        const fileName = parts[parts.length - 1] || filePath
        n.push({
          id: fileId,
          label: fileName,
          type: 'file',
          data: { path: filePath, energy: 0.3 },
          color: ENTITY_COLORS.file,
        })
        l.push({ source: task.id, target: fileId, type: 'AFFECTS' })
      }

      // Commits
      for (const commit of commits) {
        const commitId = `commit:${commit.sha}`
        n.push({
          id: commitId,
          label: commit.sha.slice(0, 7) + (commit.message ? ` ${commit.message.slice(0, 20)}` : ''),
          type: 'commit',
          data: { ...commit, energy: 0.2 },
          color: ENTITY_COLORS.commit,
        })
        l.push({ source: task.id, target: commitId, type: 'LINKED_TO' })
      }

      const graph = limitNodes(n, l, task.id)
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

// ── usePlanUniverse ─────────────────────────────────────────────────────────

export function usePlanUniverse(planId: string | undefined): UniverseResult {
  const [nodes, setNodes] = useState<UniverseNode[]>([])
  const [links, setLinks] = useState<UniverseLink[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUniverse = useCallback(async () => {
    if (!planId) return
    setIsLoading(true)
    setError(null)

    try {
      const [planResponse, tasksData, graphData] = await Promise.all([
        plansApi.get(planId),
        tasksApi.list({ plan_id: planId, limit: 100 }),
        plansApi.getDependencyGraph(planId).catch(() => null),
      ])

      const plan = (planResponse as unknown as { plan?: Plan }).plan || planResponse
      const tasks: Task[] = tasksData.items || []

      const n: UniverseNode[] = []
      const l: UniverseLink[] = []

      // Center: Plan
      const planColor = PLAN_STATUS_COLORS[plan.status] ?? ENTITY_COLORS.plan
      n.push({
        id: plan.id,
        label: plan.title,
        type: 'plan',
        data: { ...plan, energy: 1.0 },
        color: planColor,
      })

      // Task nodes
      for (const task of tasks) {
        const taskColor = TASK_STATUS_COLORS[task.status] ?? ENTITY_COLORS.task
        n.push({
          id: task.id,
          label: task.title || task.description?.slice(0, 30) || 'Untitled',
          type: 'task',
          data: { ...task, energy: 0.6 },
          color: taskColor,
        })
        l.push({ source: plan.id, target: task.id, type: 'HAS_TASK' })
      }

      // Dependency edges between tasks (from dependency graph)
      if (graphData && graphData.edges) {
        for (const edge of graphData.edges) {
          // DependencyGraphEdge uses from/to
          if (tasks.some((t) => t.id === edge.from) && tasks.some((t) => t.id === edge.to)) {
            l.push({ source: edge.from, target: edge.to, type: 'DEPENDS_ON' })
          }
        }
      }

      const graph = limitNodes(n, l, plan.id)
      setNodes(graph.nodes)
      setLinks(graph.links)
    } catch (err) {
      console.error('Failed to fetch plan universe:', err)
      setError('Failed to load plan universe')
    } finally {
      setIsLoading(false)
    }
  }, [planId])

  useEffect(() => {
    fetchUniverse()
  }, [fetchUniverse])

  return { nodes, links, isLoading, error }
}

// ── useMilestoneUniverse ────────────────────────────────────────────────────

export function useMilestoneUniverse(milestoneId: string | undefined): UniverseResult {
  const [nodes, setNodes] = useState<UniverseNode[]>([])
  const [links, setLinks] = useState<UniverseLink[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUniverse = useCallback(async () => {
    if (!milestoneId) return
    setIsLoading(true)
    setError(null)

    try {
      const { workspacesApi } = await import('@/services')
      const milestoneData = await workspacesApi.getMilestone(milestoneId)

      const n: UniverseNode[] = []
      const l: UniverseLink[] = []

      // Center: Milestone
      n.push({
        id: milestoneData.id,
        label: milestoneData.title,
        type: 'milestone',
        data: { ...milestoneData, energy: 1.0 },
        color: ENTITY_COLORS.milestone,
      })

      // Plans
      const plans = milestoneData.plans || []
      for (const plan of plans) {
        const planColor = PLAN_STATUS_COLORS[plan.status || 'draft'] ?? ENTITY_COLORS.plan
        n.push({
          id: plan.id,
          label: plan.title,
          type: 'plan',
          data: { ...plan, energy: 0.6 },
          color: planColor,
        })
        l.push({ source: milestoneData.id, target: plan.id, type: 'HAS_PLAN' })

        // Tasks under each plan
        const planTasks = plan.tasks || []
        for (const task of planTasks) {
          const taskColor = TASK_STATUS_COLORS[task.status as string] ?? ENTITY_COLORS.task
          n.push({
            id: task.id,
            label: task.title || task.description?.slice(0, 30) || 'Untitled',
            type: 'task',
            data: { ...task, energy: 0.4 },
            color: taskColor,
          })
          l.push({ source: plan.id, target: task.id, type: 'HAS_TASK' })
        }
      }

      const graph = limitNodes(n, l, milestoneData.id)
      setNodes(graph.nodes)
      setLinks(graph.links)
    } catch (err) {
      console.error('Failed to fetch milestone universe:', err)
      setError('Failed to load milestone universe')
    } finally {
      setIsLoading(false)
    }
  }, [milestoneId])

  useEffect(() => {
    fetchUniverse()
  }, [fetchUniverse])

  return { nodes, links, isLoading, error }
}

// ── useProjectUniverse ──────────────────────────────────────────────────────

export function useProjectUniverse(projectSlug: string | undefined): UniverseResult {
  const [nodes, setNodes] = useState<UniverseNode[]>([])
  const [links, setLinks] = useState<UniverseLink[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUniverse = useCallback(async () => {
    if (!projectSlug) return
    setIsLoading(true)
    setError(null)

    try {
      const project = await projectsApi.get(projectSlug)
      const plansData = await plansApi.list({ project_id: project.id, limit: 100 })
      const plans: Plan[] = plansData.items || []

      const n: UniverseNode[] = []
      const l: UniverseLink[] = []

      // Center: Project
      n.push({
        id: project.id,
        label: project.name,
        type: 'project',
        data: { ...project, energy: 1.0 },
        color: ENTITY_COLORS.plan, // projects use emerald like plans
      })

      // Plan nodes
      for (const plan of plans) {
        const planColor = PLAN_STATUS_COLORS[plan.status] ?? ENTITY_COLORS.plan
        n.push({
          id: plan.id,
          label: plan.title,
          type: 'plan',
          data: { ...plan, energy: 0.6 },
          color: planColor,
        })
        l.push({ source: project.id, target: plan.id, type: 'HAS_PLAN' })
      }

      const graph = limitNodes(n, l, project.id)
      setNodes(graph.nodes)
      setLinks(graph.links)
    } catch (err) {
      console.error('Failed to fetch project universe:', err)
      setError('Failed to load project universe')
    } finally {
      setIsLoading(false)
    }
  }, [projectSlug])

  useEffect(() => {
    fetchUniverse()
  }, [fetchUniverse])

  return { nodes, links, isLoading, error }
}

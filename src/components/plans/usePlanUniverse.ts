// ============================================================================
// usePlanUniverse — Assembles a plan's ecosystem into 3D graph data
// ============================================================================
//
// Builds nodes + links for react-force-graph-3d from the plan's dependency
// graph, decisions, constraints, commits, affected files, and chat sessions.
//
// Feature graphs are returned SEPARATELY so the UI can toggle them on/off.
// When toggled on, their entities interconnect with the base graph.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { plansApi, featureGraphsApi, chatApi, commitsApi } from '@/services'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type {
  DependencyGraph,
  DependencyGraphNode,
  Constraint,
  Decision,
  Commit,
  FeatureGraphDetail,
  ChatSession,
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

// ── Build base graph (without feature graphs) ────────────────────────────────

function buildBaseGraph(
  planId: string,
  planTitle: string,
  graph: DependencyGraph,
  constraints: Constraint[],
  decisions: Decision[],
  commits: Commit[],
  chatSessions: ChatSession[],
  /** Map of commit SHA → list of file paths touched by the commit */
  commitFilesMap: Map<string, string[]>,
): { nodes: UniverseNode[]; links: UniverseLink[] } {
  const nodes: UniverseNode[] = []
  const links: UniverseLink[] = []
  const fileNodeIds = new Set<string>()
  const nodeIds = new Set<string>()

  const addNode = (node: UniverseNode) => {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id)
      nodes.push(node)
    }
  }

  // ── Center node: Plan ────────────────────────────────────────────────────────
  addNode({
    id: planId,
    label: planTitle,
    type: 'plan',
    data: {
      energy: 1.0,
      task_count: (graph.nodes || []).length,
      completed_task_count: (graph.nodes || []).filter((t) => t.status === 'completed').length,
      file_count: new Set((graph.nodes || []).flatMap((t) => t.affected_files || [])).size,
    },
    color: ENTITY_COLORS.plan,
  })

  // ── Task nodes (from dependency graph) ───────────────────────────────────────
  for (const task of graph.nodes || []) {
    const taskColor = TASK_STATUS_COLORS[task.status] ?? ENTITY_COLORS.task
    addNode({
      id: task.id,
      label: task.title || task.id.slice(0, 8),
      type: 'task',
      data: {
        status: task.status,
        priority: task.priority,
        step_count: task.step_count,
        completed_step_count: task.completed_step_count,
        note_count: task.note_count,
        decision_count: task.decision_count,
        affected_file_count: (task.affected_files || []).length,
        session_count: task.session_count,
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
        addNode({
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
    addNode({
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
    addNode({
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
    addNode({
      id: commitId,
      label: commit.sha.slice(0, 7) + (commit.message ? ` ${commit.message.slice(0, 20)}` : ''),
      type: 'commit',
      data: { ...commit, energy: 0.2 },
      color: ENTITY_COLORS.commit,
    })
    links.push({ source: planId, target: commitId, type: 'LINKED_TO' })

    // TOUCHES links: commit → files it modified
    const touchedFiles = commitFilesMap.get(commit.sha) || []
    for (const filePath of touchedFiles) {
      const fileId = `file:${filePath}`
      // Create file node if not already present (from affected_files)
      if (!fileNodeIds.has(fileId)) {
        fileNodeIds.add(fileId)
        const parts = filePath.split('/')
        const fileName = parts[parts.length - 1] || filePath
        addNode({
          id: fileId,
          label: fileName,
          type: 'file',
          data: { path: filePath, energy: 0.3 },
          color: ENTITY_COLORS.file,
        })
      }
      links.push({ source: commitId, target: fileId, type: 'TOUCHES' })
    }
  }

  // ── Chat Sessions (Discussions) ────────────────────────────────────────────
  for (const session of chatSessions) {
    const sessionId = `chat_session:${session.id}`
    const label = session.title || `Chat ${session.id.slice(0, 8)}`
    addNode({
      id: sessionId,
      label: label.length > 30 ? label.slice(0, 29) + '…' : label,
      type: 'chat_session',
      data: {
        model: session.model,
        messageCount: session.message_count ?? 0,
        totalCostUsd: session.total_cost_usd ?? 0,
        energy: 0.4,
      },
      color: ENTITY_COLORS.chat_session,
    })
    links.push({ source: planId, target: sessionId, type: 'DISCUSSED' })
  }

  // ── Limit to ~200 nodes ──────────────────────────────────────────────────────
  if (nodes.length > 200) {
    const kept = new Set(nodes.slice(0, 200).map((n) => n.id))
    kept.add(planId) // always keep center
    return {
      nodes: nodes.filter((n) => kept.has(n.id)),
      links: links.filter((l) => kept.has(l.source) && kept.has(l.target)),
    }
  }

  return { nodes, links }
}

// ── Build nodes/links for a single feature graph ─────────────────────────────
// Returns additional nodes & links to merge into the base graph.
// Links connect FG entities to existing base nodes when file paths match.

export function buildFeatureGraphOverlay(
  fg: FeatureGraphDetail,
  planId: string,
  existingNodeIds: Set<string>,
): { nodes: UniverseNode[]; links: UniverseLink[] } {
  const nodes: UniverseNode[] = []
  const links: UniverseLink[] = []
  const addedIds = new Set<string>()

  // Build a suffix-matching index for file nodes in the base graph.
  // FG entities may use absolute paths (/Users/.../src/foo.rs) while
  // affected_files in tasks are often relative (src/foo.rs), or vice versa.
  const existingFilePaths: string[] = []
  for (const id of existingNodeIds) {
    if (id.startsWith('file:')) existingFilePaths.push(id.slice(5))
  }

  /** Resolve a FG file entity_id to the matching base graph node ID (suffix match) */
  function resolveFileNodeId(fgPath: string): string {
    // Exact match first
    if (existingNodeIds.has(`file:${fgPath}`)) return `file:${fgPath}`
    // Suffix match: FG absolute → base relative, or base absolute → FG relative
    const match = existingFilePaths.find((bp) =>
      fgPath.endsWith(bp) || bp.endsWith(fgPath),
    )
    if (match) return `file:${match}`
    // No match in base — use as-is
    return `file:${fgPath}`
  }

  // Feature graph hub node
  const fgId = `feature_graph:${fg.id}`
  nodes.push({
    id: fgId,
    label: fg.name,
    type: 'feature_graph',
    data: {
      description: fg.description,
      entity_count: fg.entities?.length ?? fg.entity_count ?? 0,
      energy: 0.7,
    },
    color: ENTITY_COLORS.feature_graph,
  })
  addedIds.add(fgId)
  links.push({ source: planId, target: fgId, type: 'HAS_FEATURE_GRAPH' })

  // Map from FG raw entity_id → resolved node ID (for relation linking later)
  const entityIdMap = new Map<string, string>()

  // FG entities → connect to existing file nodes or create new ones
  for (const entity of fg.entities || []) {
    const eType = entity.entity_type.toLowerCase()
    if (eType === 'file' || eType === 'function') {
      const entityNodeId = eType === 'file'
        ? resolveFileNodeId(entity.entity_id)
        : entity.entity_id

      // Track mapping for relation resolution
      entityIdMap.set(entity.entity_id, entityNodeId)

      // If the node already exists in the base graph → just add a CONTAINS link
      if (existingNodeIds.has(entityNodeId)) {
        links.push({ source: fgId, target: entityNodeId, type: 'CONTAINS' })
      } else if (!addedIds.has(entityNodeId)) {
        // Create a new file node for entities not in the base graph
        if (eType === 'file') {
          const parts = entity.entity_id.split('/')
          const fileName = entity.name || parts[parts.length - 1] || entity.entity_id
          nodes.push({
            id: entityNodeId,
            label: fileName,
            type: 'file',
            data: { path: entity.entity_id, energy: 0.3 },
            color: ENTITY_COLORS.file,
          })
          addedIds.add(entityNodeId)
        } else {
          // Function node
          const funcName = entity.name || entity.entity_id.split('::').pop() || entity.entity_id
          nodes.push({
            id: entityNodeId,
            label: funcName,
            type: 'function',
            data: { energy: 0.3 },
            color: ENTITY_COLORS.function,
          })
          addedIds.add(entityNodeId)
        }
        links.push({ source: fgId, target: entityNodeId, type: 'CONTAINS' })
      }
    }
  }

  // Also link FG relations (if available) — cross-entity edges
  // Note: backend returns capitalized Neo4j labels ("File", "Function") — normalize to lowercase
  // Use entityIdMap to resolve FG raw IDs to actual node IDs (handles path suffix matching)
  for (const rel of fg.relations || []) {
    const rawSourceId = rel.source_type.toLowerCase() === 'file' ? `file:${rel.source_id}` : rel.source_id
    const rawTargetId = rel.target_type.toLowerCase() === 'file' ? `file:${rel.target_id}` : rel.target_id
    // Resolve via entityIdMap (suffix-matched), fallback to raw
    const sourceId = entityIdMap.get(rel.source_id) ?? rawSourceId
    const targetId = entityIdMap.get(rel.target_id) ?? rawTargetId
    const bothExist =
      (existingNodeIds.has(sourceId) || addedIds.has(sourceId)) &&
      (existingNodeIds.has(targetId) || addedIds.has(targetId))
    if (bothExist) {
      links.push({ source: sourceId, target: targetId, type: rel.relation_type })
    }
  }

  return { nodes, links }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePlanUniverse(
  planId: string | undefined,
  planTitle?: string,
  projectSlug?: string,
) {
  const [baseNodes, setBaseNodes] = useState<UniverseNode[]>([])
  const [baseLinks, setBaseLinks] = useState<UniverseLink[]>([])
  const [featureGraphs, setFeatureGraphs] = useState<FeatureGraphDetail[]>([])
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
        setBaseNodes([])
        setBaseLinks([])
        setFeatureGraphs([])
        return
      }

      const constraints: Constraint[] = Array.isArray(constraintsData) ? constraintsData : []
      const commits: Commit[] = commitsData.items || []

      // Extract decisions from plan details (nested in tasks[].decisions[])
      const rawTasks = (planResponse as unknown as { tasks?: { task?: DependencyGraphNode; decisions?: Decision[] }[] }).tasks || []
      const allDecisions: Decision[] = rawTasks.flatMap((td) => td.decisions || [])

      const title = planTitle || (planResponse as unknown as { plan?: { title?: string } }).plan?.title || 'Plan'
      const projectId = (planResponse as unknown as { plan?: { project_id?: string } }).plan?.project_id

      // Fetch feature graphs, chat sessions, and commit files in parallel (secondary data)
      const [featureGraphDetails, chatSessions, commitFilesMap] = await Promise.all([
        // Feature graphs: from DependencyGraph summaries OR from project
        (async () => {
          try {
            const fgSummaries = graphData.feature_graphs || []
            if (fgSummaries.length > 0) {
              const details = await Promise.all(
                fgSummaries.slice(0, 10).map((fg) => featureGraphsApi.get(fg.id).catch(() => null)),
              )
              return details.filter((d): d is FeatureGraphDetail => d !== null)
            }
            if (projectId) {
              const fgList = await featureGraphsApi.list({ project_id: projectId })
              const fgs = fgList.feature_graphs || []
              if (fgs.length === 0) return []
              const details = await Promise.all(
                fgs.slice(0, 10).map((fg) => featureGraphsApi.get(fg.id).catch(() => null)),
              )
              return details.filter((d): d is FeatureGraphDetail => d !== null)
            }
            return []
          } catch { return [] }
        })(),
        // Chat sessions: by project slug
        (async () => {
          if (!projectSlug) return []
          try {
            const result = await chatApi.listSessions({ project_slug: projectSlug, limit: 20 })
            return result.items || []
          } catch { return [] }
        })(),
        // Commit files: fetch TOUCHES for each commit (capped at 20 commits)
        (async (): Promise<Map<string, string[]>> => {
          const map = new Map<string, string[]>()
          if (commits.length === 0) return map
          try {
            const results = await Promise.all(
              commits.slice(0, 20).map(async (c) => {
                try {
                  const res = await commitsApi.getCommitFiles(c.sha)
                  return { sha: c.sha, files: res.items.map((f) => f.file_path) }
                } catch { return { sha: c.sha, files: [] } }
              }),
            )
            for (const r of results) {
              if (r.files.length > 0) map.set(r.sha, r.files)
            }
          } catch { /* ignore */ }
          return map
        })(),
      ])

      const result = buildBaseGraph(
        planId, title, graphData, constraints, allDecisions, commits, chatSessions, commitFilesMap,
      )
      setBaseNodes(result.nodes)
      setBaseLinks(result.links)
      setFeatureGraphs(featureGraphDetails)
    } catch (err) {
      console.error('Failed to fetch plan universe:', err)
      setError('Failed to load plan universe')
    } finally {
      setIsLoading(false)
    }
  }, [planId, planTitle, projectSlug])

  useEffect(() => {
    fetchUniverse()
  }, [fetchUniverse])

  return { baseNodes, baseLinks, featureGraphs, isLoading, error }
}

/**
 * runHelpers — Utility functions for mapping protocol run data to Gantt timeline format.
 */

import type { RunNode } from './RunTreeView'
import type { GanttRun, GanttStateEntry } from './GanttTimeline'
import type { ProtocolRun } from '@/types/protocol'

/**
 * Map a RunNode (from run tree API) to a GanttRun for the GanttTimeline.
 */
export function mapRunNodeToGantt(node: RunNode, depth = 0): GanttRun {
  return {
    id: node.id,
    protocol_name: node.protocol_name ?? 'Run',
    status: node.status,
    started_at: node.started_at,
    finished_at: node.completed_at ?? null,
    depth,
    state_history: node.state_history?.map(
      (s): GanttStateEntry => ({
        state_name: s.state_name,
        entered_at: s.entered_at,
        exited_at: s.exited_at,
        duration_ms: s.duration_ms,
      }),
    ),
  }
}

/**
 * Flatten a RunNode tree into a flat array of GanttRuns, preserving depth.
 */
export function flattenRunTree(node: RunNode, depth = 0): GanttRun[] {
  const result: GanttRun[] = [mapRunNodeToGantt(node, depth)]
  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenRunTree(child, depth + 1))
    }
  }
  return result
}

/**
 * Map a ProtocolRun (from list API) to a GanttRun for the GanttTimeline.
 */
export function mapProtocolRunToGantt(run: ProtocolRun, depth = 0): GanttRun {
  return {
    id: run.id,
    protocol_name: run.protocol_name ?? 'Unknown',
    status: run.status,
    started_at: run.started_at,
    finished_at: run.completed_at ?? null,
    depth,
  }
}

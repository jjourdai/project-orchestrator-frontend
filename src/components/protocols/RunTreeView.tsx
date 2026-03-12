/**
 * RunTreeView — Hierarchical tree of protocol runs.
 *
 * Renders a recursive tree where each node represents a ProtocolRun.
 * Supports expand/collapse per node, status badges (with animated pulse for
 * running state), human-readable duration, and states_visited count.
 *
 * Props:
 *   rootRunId  — ID of the root run to fetch and display
 *   onRunClick — optional callback when a run node is clicked
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, ChevronDown, Clock, Layers } from 'lucide-react'
import { protocolApi } from '@/services/protocolApi'
import { useEventBus } from '@/hooks/useEventBus'
import { Skeleton, SkeletonLine, SkeletonBadge } from '@/components/ui/Skeleton'
import type { CrudEvent } from '@/types/events'
import { RunStatusBadge, type RunStatus } from './RunStatusBadge'

// ============================================================================
// TYPES
// ============================================================================

/** Mirrors the backend ProtocolRun structure. */
/** State history entry from the run tree API. */
export interface RunStateHistoryEntry {
  state_name: string
  entered_at: string
  exited_at?: string | null
  duration_ms?: number
}

/** Mirrors the backend ProtocolRun structure (tree endpoint). */
export interface RunNode {
  id: string
  protocol_id?: string
  protocol_name: string
  parent_run_id?: string | null
  status: RunStatus
  current_state?: string | null
  states_visited?: number
  started_at: string
  completed_at?: string | null
  /** @deprecated alias kept for backwards compat */
  finished_at?: string | null
  error?: string | null
  context?: Record<string, unknown> | null
  state_history?: RunStateHistoryEntry[]
  children?: RunNode[]
}

// ============================================================================
// DURATION FORMATTER
// ============================================================================

/**
 * Formats a duration between two ISO timestamps (or from start to now) into a
 * human-readable string: "2s", "1m 34s", "2h 5m", "1d 3h".
 */
export function formatRunDuration(startedAt: string, finishedAt?: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)
  const totalSecs = Math.floor(diffMs / 1000)

  if (totalSecs < 60) return `${totalSecs}s`

  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60

  if (mins < 60) return `${mins}m ${secs}s`

  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60

  if (hours < 24) return `${hours}h ${remainMins}m`

  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return `${days}d ${remainHours}h`
}

// ============================================================================
// SKELETON LOADER
// ============================================================================

function RunTreeSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3" style={{ paddingLeft: i > 0 ? `${(i % 3) * 20 + 8}px` : '8px' }}>
          <Skeleton className="w-4 h-4 rounded" />
          <SkeletonLine width={`${60 + Math.random() * 30}%`} />
          <SkeletonBadge />
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// TREE NODE (recursive)
// ============================================================================

interface RunTreeNodeProps {
  node: RunNode
  depth: number
  onRunClick?: (runId: string) => void
  selectedRunId?: string | null
}

function RunTreeNode({ node, depth, onRunClick, selectedRunId }: RunTreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0
  const [expanded, setExpanded] = useState(depth < 2) // auto-expand first 2 levels

  const isSelected = selectedRunId === node.id
  const isRunning = node.status === 'running'

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded((prev) => !prev)
  }, [])

  const handleClick = useCallback(() => {
    onRunClick?.(node.id)
  }, [onRunClick, node.id])

  return (
    <div>
      {/* Node row */}
      <div
        className={`
          group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors
          ${isSelected
            ? 'bg-indigo-500/[0.08] border border-indigo-500/30'
            : 'hover:bg-white/[0.04] border border-transparent'
          }
        `}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={handleClick}
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={isSelected}
      >
        {/* Expand/collapse toggle */}
        <button
          className={`shrink-0 w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors ${hasChildren ? 'cursor-pointer' : 'invisible'}`}
          onClick={handleToggle}
          tabIndex={-1}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {hasChildren && (
            expanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Protocol name */}
        <span className={`text-sm font-medium truncate flex-1 min-w-0 ${isSelected ? 'text-gray-100' : 'text-gray-300 group-hover:text-gray-200'}`}>
          {node.protocol_name}
          {node.current_state && (
            <span className="ml-1.5 text-[11px] text-gray-500 font-normal">
              @ {node.current_state}
            </span>
          )}
        </span>

        {/* Status badge */}
        <RunStatusBadge status={node.status} />

        {/* Metrics */}
        <div className="flex items-center gap-3 text-[11px] text-gray-500 shrink-0 tabular-nums font-mono">
          {/* Duration */}
          <span className="inline-flex items-center gap-1" title="Duration">
            <Clock className={`w-3 h-3 ${isRunning ? 'text-cyan-500' : ''}`} />
            {formatRunDuration(node.started_at, node.completed_at ?? node.finished_at)}
          </span>

          {/* States visited */}
          {(node.states_visited ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1" title="States visited">
              <Layers className="w-3 h-3" />
              {node.states_visited}
            </span>
          )}
        </div>
      </div>

      {/* Error message (if failed) */}
      {node.status === 'failed' && node.error && (
        <div
          className="ml-6 mt-0.5 mb-1 px-2 py-1 text-[11px] text-red-400/80 bg-red-500/[0.06] rounded border border-red-500/10 truncate"
          style={{ marginLeft: `${depth * 20 + 32}px` }}
          title={node.error}
        >
          {node.error}
        </div>
      )}

      {/* Children (recursive) */}
      {hasChildren && expanded && (
        <div role="group">
          {node.children!.map((child) => (
            <RunTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onRunClick={onRunClick}
              selectedRunId={selectedRunId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface RunTreeViewProps {
  /** ID of the root protocol run to display */
  rootRunId: string
  /** Callback when a run node is clicked */
  onRunClick?: (runId: string) => void
  /** Externally controlled selection (optional) */
  selectedRunId?: string | null
  /** Additional CSS class on the outer wrapper */
  className?: string
}

export function RunTreeView({ rootRunId, onRunClick, selectedRunId, className = '' }: RunTreeViewProps) {
  const [rootNode, setRootNode] = useState<RunNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch the run tree from the backend
  const fetchTree = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await protocolApi.getRunTree(rootRunId)
      setRootNode(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run tree')
    } finally {
      setLoading(false)
    }
  }, [rootRunId])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  // Event-driven refresh via WebSocket CRUD events
  const fetchTreeRef = useRef(fetchTree)
  useEffect(() => { fetchTreeRef.current = fetchTree }, [fetchTree])

  const handleCrudEvent = useCallback((event: CrudEvent) => {
    if (event.entity_type !== 'protocol_run') return
    // Refresh tree on any run create/update/delete event
    fetchTreeRef.current()
  }, [])

  useEventBus(handleCrudEvent)

  // Fallback polling while any node is running (in case WS is disconnected)
  useEffect(() => {
    if (!rootNode) return

    const hasRunning = (node: RunNode): boolean => {
      if (node.status === 'running') return true
      return node.children?.some(hasRunning) ?? false
    }

    if (!hasRunning(rootNode)) return

    // Slower polling as fallback — WS handles real-time
    const interval = setInterval(fetchTree, 10000)
    return () => clearInterval(interval)
  }, [rootNode, fetchTree])

  // --- Render ---

  if (loading && !rootNode) {
    return (
      <div className={className}>
        <RunTreeSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`p-4 text-sm text-red-400 ${className}`}>
        <p className="font-medium">Failed to load run tree</p>
        <p className="text-red-400/60 text-xs mt-1">{error}</p>
        <button
          onClick={fetchTree}
          className="mt-2 text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2 cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!rootNode) return null

  return (
    <div className={`${className}`} role="tree" aria-label="Protocol run tree">
      <RunTreeNode
        node={rootNode}
        depth={0}
        onRunClick={onRunClick}
        selectedRunId={selectedRunId}
      />
    </div>
  )
}

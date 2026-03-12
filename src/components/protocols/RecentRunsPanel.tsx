/**
 * RecentRunsPanel — Shows recent protocol runs across all protocols.
 *
 * Fetches the latest run for each protocol in the project, aggregates them,
 * sorts by most recent, and displays a timeline-like list with:
 *   - Protocol name
 *   - Run status badge
 *   - Current state
 *   - Started time (relative)
 *   - Duration (if completed)
 */

import { useState, useEffect, useCallback } from 'react'
import { Activity, Clock, ChevronRight, AlertCircle } from 'lucide-react'
import { protocolApi } from '@/services/protocolApi'
import { RunStatusBadge } from './RunStatusBadge'
import type { Protocol, ProtocolRun } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunWithProtocol {
  run: ProtocolRun
  protocolName: string
  protocolId: string
}

interface RecentRunsPanelProps {
  protocols: Protocol[]
  /** Maximum number of runs to display */
  maxRuns?: number
  /** Callback when clicking a run row */
  onRunClick?: (protocolId: string, runId: string) => void
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diffMs / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDuration(startIso: string, endIso?: string | null): string | null {
  if (!endIso) return null
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (ms < 1000) return `${ms}ms`
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentRunsPanel({
  protocols,
  maxRuns = 20,
  onRunClick,
  className = '',
}: RecentRunsPanelProps) {
  const [runs, setRuns] = useState<RunWithProtocol[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAllRuns = useCallback(async () => {
    if (protocols.length === 0) {
      setRuns([])
      setLoading(false)
      return
    }

    setLoading(true)
    const results: RunWithProtocol[] = []

    // Fetch latest 3 runs per protocol in parallel
    const batches = await Promise.allSettled(
      protocols.map(async (p) => {
        const res = await protocolApi.listRuns(p.id, { limit: 3 })
        return res.items.map((run) => ({
          run,
          protocolName: p.name,
          protocolId: p.id,
        }))
      }),
    )

    for (const batch of batches) {
      if (batch.status === 'fulfilled') {
        results.push(...batch.value)
      }
    }

    // Sort by most recent start time
    results.sort((a, b) => new Date(b.run.started_at).getTime() - new Date(a.run.started_at).getTime())

    setRuns(results.slice(0, maxRuns))
    setLoading(false)
  }, [protocols, maxRuns])

  useEffect(() => {
    fetchAllRuns()
  }, [fetchAllRuns])

  // Empty state
  if (!loading && runs.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 gap-3 ${className}`}>
        <Activity className="w-8 h-8 text-gray-600" />
        <p className="text-sm text-gray-500">No FSM runs yet</p>
        <p className="text-xs text-gray-600 max-w-xs text-center">
          Protocol runs will appear here as they execute.
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-medium text-gray-300">
          Recent FSM Activity
        </span>
        {loading && (
          <span className="text-[10px] text-gray-600 ml-auto">Loading...</span>
        )}
        {!loading && (
          <span className="text-[10px] text-gray-600 ml-auto">
            {runs.length} run{runs.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Loading shimmer */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      )}

      {/* Run list */}
      {!loading && runs.map(({ run, protocolName, protocolId }) => {
        const duration = formatDuration(run.started_at, run.completed_at)
        const currentState = run.current_state_name ?? run.states_visited?.slice(-1)[0]?.state_name

        return (
          <div
            key={run.id}
            onClick={onRunClick ? () => onRunClick(protocolId, run.id) : undefined}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02]
              ${onRunClick ? 'cursor-pointer hover:border-white/10 hover:bg-white/[0.04] transition-colors' : ''}
            `}
          >
            {/* Status indicator */}
            <div className="shrink-0">
              <RunStatusBadge status={run.status} />
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200 truncate">
                  {protocolName}
                </span>
                {currentState && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-400 shrink-0">
                    {currentState}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(run.started_at)}
                </span>
                {duration && (
                  <span className="text-gray-600">{duration}</span>
                )}
                {run.error && (
                  <span className="inline-flex items-center gap-1 text-red-400/70">
                    <AlertCircle className="w-3 h-3" />
                    Error
                  </span>
                )}
                <span className="font-mono text-gray-600">{run.id.slice(0, 8)}</span>
              </div>
            </div>

            {/* Arrow */}
            {onRunClick && (
              <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
            )}
          </div>
        )
      })}
    </div>
  )
}

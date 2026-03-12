/**
 * RecentRunsPanel — Visual timeline of recent protocol runs across all protocols.
 *
 * Each run is displayed as a card with:
 *   - Color-coded left border by status
 *   - Animated pulse for running states
 *   - Protocol name with category badge
 *   - Current state chip
 *   - Timeline info: started, duration, states visited count
 *   - Error preview for failed runs
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  Clock,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Timer,
  GitBranch,
  CircleDot,
} from 'lucide-react'
import { protocolApi } from '@/services/protocolApi'
import type { Protocol, ProtocolRun, RunStatus } from '@/types/protocol'

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
  maxRuns?: number
  onRunClick?: (protocolId: string, runId: string) => void
  className?: string
}

// ---------------------------------------------------------------------------
// Status visual config
// ---------------------------------------------------------------------------

const statusVisuals: Record<RunStatus, {
  label: string
  border: string
  icon: typeof CheckCircle2
  iconColor: string
  bgGlow: string
}> = {
  pending:   { label: 'Pending',   border: 'border-l-gray-500',   icon: CircleDot,    iconColor: 'text-gray-400',  bgGlow: '' },
  running:   { label: 'Running',   border: 'border-l-cyan-500',   icon: Loader2,      iconColor: 'text-cyan-400',  bgGlow: 'bg-cyan-500/[0.03]' },
  completed: { label: 'Completed', border: 'border-l-emerald-500', icon: CheckCircle2, iconColor: 'text-emerald-400', bgGlow: '' },
  failed:    { label: 'Failed',    border: 'border-l-red-500',    icon: XCircle,       iconColor: 'text-red-400',   bgGlow: 'bg-red-500/[0.03]' },
  cancelled: { label: 'Cancelled', border: 'border-l-gray-600',   icon: XCircle,       iconColor: 'text-gray-500',  bgGlow: '' },
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
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function formatDuration(startIso: string, endIso?: string | null): string | null {
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const ms = end - new Date(startIso).getTime()
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
  maxRuns = 25,
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

    results.sort((a, b) => new Date(b.run.started_at).getTime() - new Date(a.run.started_at).getTime())
    setRuns(results.slice(0, maxRuns))
    setLoading(false)
  }, [protocols, maxRuns])

  useEffect(() => {
    fetchAllRuns()
  }, [fetchAllRuns])

  // Aggregate stats
  const runningCount = runs.filter((r) => r.run.status === 'running').length
  const failedCount = runs.filter((r) => r.run.status === 'failed').length

  // Empty state
  if (!loading && runs.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 gap-4 ${className}`}>
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
          <Activity className="w-7 h-7 text-gray-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-400">No FSM runs yet</p>
          <p className="text-xs text-gray-600 mt-1 max-w-xs">
            Protocol runs will appear here as they execute. Start a run from a protocol or trigger a scheduled action.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-gray-200">FSM Activity</span>
        </div>
        <div className="flex items-center gap-3 ml-auto text-xs">
          {loading && (
            <span className="flex items-center gap-1.5 text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading...
            </span>
          )}
          {!loading && runningCount > 0 && (
            <span className="flex items-center gap-1.5 text-cyan-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
              </span>
              {runningCount} running
            </span>
          )}
          {!loading && failedCount > 0 && (
            <span className="flex items-center gap-1.5 text-red-400/80">
              <AlertTriangle className="w-3 h-3" />
              {failedCount} failed
            </span>
          )}
          {!loading && (
            <span className="text-gray-600">{runs.length} total</span>
          )}
        </div>
      </div>

      {/* Loading shimmer */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-xl bg-white/[0.02] border border-white/[0.04] animate-pulse" />
          ))}
        </div>
      )}

      {/* Run cards */}
      {!loading && (
        <div className="space-y-2">
          {runs.map(({ run, protocolName, protocolId }) => {
            const vis = statusVisuals[run.status] ?? statusVisuals.pending
            const StatusIcon = vis.icon
            const duration = formatDuration(run.started_at, run.completed_at)
            const currentState = run.current_state_name ?? run.states_visited?.slice(-1)[0]?.state_name
            const statesCount = run.states_visited?.length ?? 0

            return (
              <div
                key={run.id}
                onClick={onRunClick ? () => onRunClick(protocolId, run.id) : undefined}
                className={`
                  group relative rounded-xl border border-white/[0.06] ${vis.bgGlow || 'bg-white/[0.02]'}
                  border-l-[3px] ${vis.border}
                  ${onRunClick ? 'cursor-pointer hover:border-white/10 hover:bg-white/[0.04] transition-all' : ''}
                  px-4 py-3
                `}
              >
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <div className="shrink-0">
                    <StatusIcon
                      className={`w-5 h-5 ${vis.iconColor} ${run.status === 'running' ? 'animate-spin' : ''}`}
                    />
                  </div>

                  {/* Main content */}
                  <div className="min-w-0 flex-1">
                    {/* Row 1: protocol name + state chip */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-100 truncate">
                        {protocolName}
                      </span>
                      {currentState && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shrink-0">
                          <GitBranch className="w-2.5 h-2.5" />
                          {currentState}
                        </span>
                      )}
                      <span className={`text-[10px] font-medium ml-auto shrink-0 ${vis.iconColor}`}>
                        {vis.label}
                      </span>
                    </div>

                    {/* Row 2: metadata */}
                    <div className="flex items-center gap-3 text-[11px] text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(run.started_at)}
                      </span>
                      {duration && (
                        <span className="inline-flex items-center gap-1">
                          <Timer className="w-3 h-3" />
                          {duration}
                        </span>
                      )}
                      {statesCount > 0 && (
                        <span className="text-gray-600">
                          {statesCount} state{statesCount !== 1 ? 's' : ''} visited
                        </span>
                      )}
                      <span className="font-mono text-gray-700 ml-auto">{run.id.slice(0, 8)}</span>
                    </div>

                    {/* Row 3: error preview (failed runs only) */}
                    {run.error && (
                      <div className="mt-1.5 text-[11px] text-red-400/70 bg-red-500/[0.06] border border-red-500/10 rounded-md px-2 py-1 truncate">
                        {run.error}
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  {onRunClick && (
                    <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors shrink-0" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { memo, useState } from 'react'
import { PulseIndicator } from '@/components/ui'
import { ChevronDown, ChevronUp, Eye, Square, Clock, DollarSign } from 'lucide-react'
import type { DetachedRun } from '@/hooks'

interface DetachedRunsPanelProps {
  /** List of detached child runs */
  runs: DetachedRun[]
  /** Whether any run is currently active */
  hasActiveRuns: boolean
  /** Navigate to a child session */
  onViewRun: (sessionId: string) => void
  /** Interrupt a running session */
  onStopRun: (sessionId: string) => void
}

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return `${diffSecs}s`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  return `${diffHours}h ${diffMins % 60}m`
}

function formatCost(cost?: number): string | null {
  if (!cost) return null
  return `$${cost.toFixed(2)}`
}

/**
 * Collapsible panel showing detached child runs at the top of ChatPanel.
 * Displayed when the current session has spawned sub-sessions (via PlanRunner or sub-agents).
 *
 * Features:
 * - Compact header with run count and pulse indicator
 * - Expandable list with title, status, duration, cost
 * - "View" button to switch to the child session
 * - "Stop" button to interrupt a running child
 */
export const DetachedRunsPanel = memo(function DetachedRunsPanel({
  runs,
  hasActiveRuns,
  onViewRun,
  onStopRun,
}: DetachedRunsPanelProps) {
  const [expanded, setExpanded] = useState(false)

  if (runs.length === 0) return null

  const activeCount = runs.filter(r => r.isStreaming).length
  const completedCount = runs.length - activeCount

  return (
    <div className="border-b border-white/[0.06] bg-amber-500/[0.03]">
      {/* Compact header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-amber-500/[0.04] transition-colors"
      >
        {hasActiveRuns && <PulseIndicator variant="pending" size={6} />}
        <span className="text-xs text-amber-400 font-medium">
          {activeCount > 0
            ? `${activeCount} run${activeCount > 1 ? 's' : ''} in progress`
            : `${completedCount} run${completedCount > 1 ? 's' : ''} completed`}
        </span>
        {completedCount > 0 && activeCount > 0 && (
          <span className="text-[10px] text-gray-500">
            · {completedCount} done
          </span>
        )}
        <div className="flex-1" />
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        )}
      </button>

      {/* Expanded run list */}
      {expanded && (
        <div className="px-2 pb-2 space-y-1 max-h-48 overflow-y-auto">
          {runs.map(run => (
            <div
              key={run.sessionId}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.04] transition-colors group"
            >
              {/* Status indicator */}
              {run.isStreaming ? (
                <PulseIndicator variant="active" size={6} />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />
              )}

              {/* Run info */}
              <div className="flex-1 min-w-0">
                <span className="text-xs text-gray-300 truncate block">
                  {run.title}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDuration(run.startedAt)}
                  </span>
                  {formatCost(run.costUsd) && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                      <DollarSign className="w-2.5 h-2.5" />
                      {formatCost(run.costUsd)}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-600 truncate max-w-[60px]">
                    {run.model}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); onViewRun(run.sessionId) }}
                  className="p-1 rounded text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                  title="View run"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                {run.isStreaming && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onStopRun(run.sessionId) }}
                    className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Stop run"
                  >
                    <Square className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

/**
 * ScheduledActionsPanel — Visual dashboard of protocols with trigger_mode configured.
 *
 * Each scheduled action is a rich card with:
 *   - Color-coded left border by trigger mode
 *   - Mode icon + badge
 *   - Trigger config in a monospace chip
 *   - Last triggered time with visual indicator
 *   - Latest run status with color-coded background
 *   - Prominent "Trigger Now" button
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Clock,
  Zap,
  Play,
  Calendar,
  Webhook,
  Radio,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleDot,
  Timer,
} from 'lucide-react'
import { protocolApi } from '@/services/protocolApi'
import type { Protocol, ProtocolRun, RunStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Trigger mode visuals
// ---------------------------------------------------------------------------

const triggerModeConfig: Record<string, {
  label: string
  icon: typeof Clock
  color: string
  border: string
  badgeBg: string
}> = {
  scheduled: {
    label: 'Scheduled',
    icon: Calendar,
    color: 'text-blue-400',
    border: 'border-l-blue-500',
    badgeBg: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  },
  auto: {
    label: 'Auto',
    icon: Zap,
    color: 'text-amber-400',
    border: 'border-l-amber-500',
    badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  },
  event: {
    label: 'Event',
    icon: Radio,
    color: 'text-purple-400',
    border: 'border-l-purple-500',
    badgeBg: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  },
  webhook: {
    label: 'Webhook',
    icon: Webhook,
    color: 'text-cyan-400',
    border: 'border-l-cyan-500',
    badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  },
}

// Run status mini-config
const runStatusConfig: Record<RunStatus, {
  label: string
  icon: typeof CheckCircle2
  color: string
  bg: string
}> = {
  pending:   { label: 'Pending',   icon: CircleDot,    color: 'text-gray-400',    bg: 'bg-white/[0.04]' },
  running:   { label: 'Running',   icon: Loader2,      color: 'text-cyan-400',    bg: 'bg-cyan-500/[0.08]' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/[0.08]' },
  failed:    { label: 'Failed',    icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-500/[0.08]' },
  cancelled: { label: 'Cancelled', icon: XCircle,       color: 'text-gray-500',   bg: 'bg-white/[0.04]' },
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

function formatTriggerConfig(config: Record<string, unknown>): string {
  if (config.cron) return `${config.cron}`
  if (config.webhook_url) return `${config.webhook_url}`
  if (config.event_pattern) return `${config.event_pattern}`
  if (config.interval) return `every ${config.interval}`
  const entries = Object.entries(config)
  if (entries.length > 0) {
    const [key, value] = entries[0]
    return `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`
  }
  return 'No config'
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduledProtocol {
  protocol: Protocol
  latestRun?: ProtocolRun
  loadingRun: boolean
}

interface ScheduledActionsPanelProps {
  protocols: Protocol[]
  onTrigger?: (protocolId: string) => void
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduledActionsPanel({ protocols, onTrigger, className = '' }: ScheduledActionsPanelProps) {
  const scheduled = protocols.filter((p) => p.trigger_mode && p.trigger_mode !== 'manual')

  const [items, setItems] = useState<ScheduledProtocol[]>([])
  const [triggeringId, setTriggeringId] = useState<string | null>(null)

  const fetchLatestRuns = useCallback(async () => {
    const results: ScheduledProtocol[] = scheduled.map((p) => ({
      protocol: p,
      loadingRun: true,
    }))
    setItems(results)

    const updated = await Promise.all(
      scheduled.map(async (p) => {
        try {
          const res = await protocolApi.listRuns(p.id, { limit: 1 })
          return { protocol: p, latestRun: res.items[0], loadingRun: false }
        } catch {
          return { protocol: p, loadingRun: false }
        }
      }),
    )
    setItems(updated)
  }, [protocols])

  useEffect(() => {
    if (scheduled.length > 0) {
      fetchLatestRuns()
    } else {
      setItems([])
    }
  }, [fetchLatestRuns])

  const handleTrigger = useCallback(
    async (protocolId: string) => {
      setTriggeringId(protocolId)
      try {
        await protocolApi.startRun(protocolId)
        onTrigger?.(protocolId)
        await fetchLatestRuns()
      } catch (err) {
        console.error('Failed to trigger protocol:', err)
      } finally {
        setTriggeringId(null)
      }
    },
    [onTrigger, fetchLatestRuns],
  )

  // Empty state
  if (scheduled.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 gap-4 ${className}`}>
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
          <Clock className="w-7 h-7 text-gray-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-400">No scheduled actions</p>
          <p className="text-xs text-gray-600 mt-1 max-w-xs">
            Protocols with trigger modes (auto, scheduled, event, webhook) will appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Summary */}
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium text-gray-200">Scheduled Actions</span>
        <span className="text-xs text-gray-600 ml-auto">
          {scheduled.length} configured
        </span>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.map(({ protocol, latestRun, loadingRun }) => {
          const mode = triggerModeConfig[protocol.trigger_mode ?? ''] ?? triggerModeConfig.auto
          const ModeIcon = mode.icon
          const isTriggering = triggeringId === protocol.id

          return (
            <div
              key={protocol.id}
              className={`
                rounded-xl border border-white/[0.06] bg-white/[0.02]
                border-l-[3px] ${mode.border}
                p-4 space-y-3
              `}
            >
              {/* Row 1: Name + mode badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-gray-100 truncate">
                    {protocol.name}
                  </h4>
                  {protocol.description && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {protocol.description}
                    </p>
                  )}
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border shrink-0 ${mode.badgeBg}`}>
                  <ModeIcon className="w-3 h-3" />
                  {mode.label}
                </span>
              </div>

              {/* Row 2: Trigger config chip */}
              {protocol.trigger_config && (
                <div className="text-[11px] text-gray-400 font-mono bg-white/[0.04] border border-white/[0.06] rounded-md px-2.5 py-1.5 truncate">
                  {formatTriggerConfig(protocol.trigger_config)}
                </div>
              )}

              {/* Row 3: Last triggered + latest run + trigger button */}
              <div className="flex items-center gap-2">
                {/* Last triggered */}
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <Clock className="w-3 h-3" />
                  {protocol.last_triggered_at ? (
                    <span title={protocol.last_triggered_at}>
                      {formatRelativeTime(protocol.last_triggered_at)}
                    </span>
                  ) : (
                    <span className="text-gray-600 italic">Never</span>
                  )}
                </div>

                {/* Latest run status chip */}
                {!loadingRun && latestRun && (() => {
                  const rs = runStatusConfig[latestRun.status] ?? runStatusConfig.pending
                  const RsIcon = rs.icon
                  return (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${rs.bg} ${rs.color}`}>
                      <RsIcon className={`w-3 h-3 ${latestRun.status === 'running' ? 'animate-spin' : ''}`} />
                      {rs.label}
                    </span>
                  )
                })()}

                {!loadingRun && !latestRun && (
                  <span className="text-[10px] text-gray-600 italic">No runs</span>
                )}

                {loadingRun && (
                  <Loader2 className="w-3 h-3 text-gray-600 animate-spin" />
                )}

                {/* Spacer + trigger button */}
                <div className="ml-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTrigger(protocol.id)
                    }}
                    disabled={isTriggering}
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
                      transition-all
                      ${isTriggering
                        ? 'bg-white/[0.06] text-gray-500'
                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 hover:border-emerald-500/30 active:scale-95'
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    {isTriggering ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    {isTriggering ? 'Starting…' : 'Trigger'}
                  </button>
                </div>
              </div>

              {/* Latest run duration (if available) */}
              {latestRun?.completed_at && (
                <div className="flex items-center gap-1 text-[10px] text-gray-600">
                  <Timer className="w-3 h-3" />
                  Last run took {(() => {
                    const ms = new Date(latestRun.completed_at!).getTime() - new Date(latestRun.started_at).getTime()
                    if (ms < 1000) return `${ms}ms`
                    const s = Math.floor(ms / 1000)
                    if (s < 60) return `${s}s`
                    const m = Math.floor(s / 60)
                    return `${m}m ${s % 60}s`
                  })()}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

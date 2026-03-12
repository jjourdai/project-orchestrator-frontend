/**
 * ScheduledActionsPanel — Shows protocols that have a trigger_mode configured.
 *
 * Displays:
 *   - Protocol name and trigger mode badge
 *   - Trigger config details (cron, webhook URL, event pattern)
 *   - Last triggered timestamp (relative time)
 *   - Latest run status (fetched per-protocol)
 *   - "Trigger Now" button to manually start a run
 */

import { useState, useEffect, useCallback } from 'react'
import { Clock, Zap, Play, AlertCircle, Calendar, Webhook, Radio } from 'lucide-react'
import { protocolApi } from '@/services/protocolApi'
import { RunStatusBadge } from './RunStatusBadge'
import type { Protocol, ProtocolRun } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const triggerModeConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  scheduled: { label: 'Scheduled', icon: Calendar, color: 'text-blue-400 bg-blue-500/10' },
  auto:      { label: 'Auto',      icon: Zap,      color: 'text-amber-400 bg-amber-500/10' },
  event:     { label: 'Event',     icon: Radio,     color: 'text-purple-400 bg-purple-500/10' },
  webhook:   { label: 'Webhook',   icon: Webhook,   color: 'text-cyan-400 bg-cyan-500/10' },
}

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

function formatTriggerConfig(config: Record<string, unknown>): string {
  if (config.cron) return `cron: ${config.cron}`
  if (config.webhook_url) return `webhook: ${config.webhook_url}`
  if (config.event_pattern) return `event: ${config.event_pattern}`
  if (config.interval) return `every ${config.interval}`
  // Fallback: show first key=value
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

  // Fetch latest run for each scheduled protocol
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
          return {
            protocol: p,
            latestRun: res.items[0],
            loadingRun: false,
          }
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

  // Handle manual trigger
  const handleTrigger = useCallback(
    async (protocolId: string) => {
      setTriggeringId(protocolId)
      try {
        await protocolApi.startRun(protocolId)
        onTrigger?.(protocolId)
        // Refresh runs after trigger
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
      <div className={`flex flex-col items-center justify-center py-12 gap-3 ${className}`}>
        <Clock className="w-8 h-8 text-gray-600" />
        <p className="text-sm text-gray-500">No scheduled actions</p>
        <p className="text-xs text-gray-600 max-w-xs text-center">
          Protocols with trigger modes (auto, scheduled, event) will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <Zap className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium text-gray-300">
          {scheduled.length} scheduled action{scheduled.length !== 1 ? 's' : ''}
        </span>
      </div>

      {items.map(({ protocol, latestRun, loadingRun }) => {
        const mode = triggerModeConfig[protocol.trigger_mode ?? ''] ?? triggerModeConfig.auto
        const ModeIcon = mode.icon
        const isTriggering = triggeringId === protocol.id

        return (
          <div
            key={protocol.id}
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-3"
          >
            {/* Header: name + trigger mode badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm font-medium text-gray-200 truncate">
                  {protocol.name}
                </h4>
                {protocol.description && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {protocol.description}
                  </p>
                )}
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${mode.color}`}>
                <ModeIcon className="w-3 h-3" />
                {mode.label}
              </span>
            </div>

            {/* Trigger config */}
            {protocol.trigger_config && (
              <div className="text-xs text-gray-500 font-mono bg-white/[0.03] rounded px-2 py-1 truncate">
                {formatTriggerConfig(protocol.trigger_config)}
              </div>
            )}

            {/* Status row: last triggered + latest run */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {/* Last triggered */}
                {protocol.last_triggered_at ? (
                  <span className="inline-flex items-center gap-1" title={protocol.last_triggered_at}>
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(protocol.last_triggered_at)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-gray-600">
                    <Clock className="w-3 h-3" />
                    Never triggered
                  </span>
                )}

                {/* Latest run status */}
                {loadingRun ? (
                  <span className="text-gray-600">Loading...</span>
                ) : latestRun ? (
                  <RunStatusBadge status={latestRun.status} />
                ) : (
                  <span className="inline-flex items-center gap-1 text-gray-600">
                    <AlertCircle className="w-3 h-3" />
                    No runs
                  </span>
                )}
              </div>

              {/* Trigger button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleTrigger(protocol.id)
                }}
                disabled={isTriggering}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                <Play className={`w-3 h-3 ${isTriggering ? 'animate-spin' : ''}`} />
                {isTriggering ? 'Starting...' : 'Trigger Now'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

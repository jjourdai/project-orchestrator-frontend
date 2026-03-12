/**
 * RunStatusBadge — Status indicator for protocol runs.
 *
 * Renders a colored badge with an optional animated pulse for the "running" state.
 * Follows the same visual language as AgentCard status dots and the shared Badge component.
 */

import { PulseIndicator } from '@/components/ui/PulseIndicator'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

interface RunStatusBadgeProps {
  status: RunStatus
  className?: string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const statusConfig: Record<RunStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending:   { label: 'Pending',   bg: 'bg-white/[0.08]',    text: 'text-gray-300',   dot: 'bg-gray-400' },
  running:   { label: 'Running',   bg: 'bg-cyan-500/15',     text: 'text-cyan-400',   dot: 'bg-cyan-400' },
  completed: { label: 'Completed', bg: 'bg-green-500/15',    text: 'text-green-400',  dot: 'bg-green-400' },
  failed:    { label: 'Failed',    bg: 'bg-red-500/15',      text: 'text-red-400',    dot: 'bg-red-400' },
  cancelled: { label: 'Cancelled', bg: 'bg-white/[0.06]',    text: 'text-gray-500',   dot: 'bg-gray-500' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RunStatusBadge({ status, className = '' }: RunStatusBadgeProps) {
  const cfg = statusConfig[status] ?? statusConfig.pending

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${cfg.bg} ${cfg.text} ${className}`}
    >
      {status === 'running' ? (
        <PulseIndicator variant="active" size={6} className="[&_.pulse-ring]:!bg-cyan-400 [&>span:last-child]:!bg-cyan-400" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      )}
      {cfg.label}
    </span>
  )
}

/**
 * RfcStatusBadge — Color-coded status badge for RFC documents.
 *
 * Colors:
 *   draft       = gray
 *   proposed    = blue
 *   accepted    = green
 *   implemented = emerald
 *   rejected    = red
 */

import type { RfcStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const statusConfig: Record<RfcStatus, { label: string; bg: string; text: string; dot: string }> = {
  draft:        { label: 'Draft',        bg: 'bg-white/[0.08]',     text: 'text-gray-300',    dot: 'bg-gray-400' },
  proposed:     { label: 'Proposed',     bg: 'bg-blue-500/15',      text: 'text-blue-400',    dot: 'bg-blue-400' },
  under_review: { label: 'Under Review', bg: 'bg-cyan-500/15',      text: 'text-cyan-400',    dot: 'bg-cyan-400' },
  accepted:     { label: 'Accepted',     bg: 'bg-green-500/15',     text: 'text-green-400',   dot: 'bg-green-400' },
  planning:     { label: 'Planning',     bg: 'bg-violet-500/15',    text: 'text-violet-400',  dot: 'bg-violet-400' },
  in_progress:  { label: 'In Progress',  bg: 'bg-indigo-500/15',    text: 'text-indigo-400',  dot: 'bg-indigo-400' },
  implemented:  { label: 'Implemented',  bg: 'bg-emerald-500/15',   text: 'text-emerald-400', dot: 'bg-emerald-400' },
  rejected:     { label: 'Rejected',     bg: 'bg-red-500/15',       text: 'text-red-400',     dot: 'bg-red-400' },
  superseded:   { label: 'Superseded',   bg: 'bg-amber-500/15',     text: 'text-amber-400',   dot: 'bg-amber-400' },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RfcStatusBadgeProps {
  status: RfcStatus
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RfcStatusBadge({ status, className = '' }: RfcStatusBadgeProps) {
  const cfg = statusConfig[status] ?? statusConfig.draft

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${cfg.bg} ${cfg.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

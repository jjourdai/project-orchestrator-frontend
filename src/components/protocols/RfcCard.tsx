/**
 * RfcCard — Rich card for displaying an RFC in list view.
 *
 * Visual features:
 *   - Color-coded left border by lifecycle status
 *   - Importance indicator (colored dot)
 *   - Status badge + section count
 *   - Content preview (Problem section or markdown extract)
 *   - Timeline metadata row
 *   - Action buttons with proper disabled state when no run linked
 */

import {
  Calendar,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Rocket,
  Send,
  ChevronRight,
  BookOpen,
  AlertTriangle,
  Hash,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { RfcStatusBadge } from './RfcStatusBadge'
import type { Rfc, RfcStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RfcCardProps {
  rfc: Rfc
  onAction?: (rfcId: string, action: 'propose' | 'accept' | 'reject' | 'implement') => void
  onClick?: (rfcId: string) => void
  className?: string
}

// ---------------------------------------------------------------------------
// Visual config
// ---------------------------------------------------------------------------

const statusBorder: Record<RfcStatus, string> = {
  draft:       'border-l-gray-500',
  proposed:    'border-l-blue-500',
  accepted:    'border-l-green-500',
  implemented: 'border-l-emerald-500',
  rejected:    'border-l-red-500',
}

const statusGlow: Record<RfcStatus, string> = {
  draft:       '',
  proposed:    'bg-blue-500/[0.02]',
  accepted:    'bg-green-500/[0.02]',
  implemented: 'bg-emerald-500/[0.02]',
  rejected:    'bg-red-500/[0.02]',
}

const importanceConfig: Record<string, { dot: string; label: string }> = {
  critical: { dot: 'bg-red-400',    label: 'Critical' },
  high:     { dot: 'bg-orange-400', label: 'High' },
  medium:   { dot: 'bg-yellow-400', label: 'Medium' },
  low:      { dot: 'bg-gray-400',   label: 'Low' },
}

const actionConfig = {
  propose:   { label: 'Propose',   icon: Send,      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20' },
  accept:    { label: 'Accept',    icon: ThumbsUp,  color: 'text-green-400 bg-green-500/10 border-green-500/20 hover:bg-green-500/20' },
  reject:    { label: 'Reject',    icon: ThumbsDown, color: 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20' },
  implement: { label: 'Implement', icon: Rocket,    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20' },
} as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSection(rfc: Rfc, title: string): string | undefined {
  return rfc.sections.find((s) => s.title.toLowerCase().includes(title.toLowerCase()))?.content
}

function extractContentPreview(content: string, maxLen: number): string {
  const lines = content.split('\n')
  const meaningful: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---') || (trimmed.startsWith('**') && trimmed.includes(':'))) continue
    meaningful.push(trimmed)
    if (meaningful.join(' ').length >= maxLen) break
  }
  const text = meaningful.join(' ')
  return text.length <= maxLen ? text : text.slice(0, maxLen).trimEnd() + '…'
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen).trimEnd() + '…'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function availableActions(status: RfcStatus): ('propose' | 'accept' | 'reject' | 'implement')[] {
  switch (status) {
    case 'draft':    return ['propose']
    case 'proposed': return ['accept', 'reject']
    case 'accepted': return ['implement']
    default:         return []
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RfcCard({ rfc, onAction, onClick, className = '' }: RfcCardProps) {
  const imp = importanceConfig[rfc.importance] ?? importanceConfig.medium
  const problem = findSection(rfc, 'problem')
  const solution = findSection(rfc, 'proposed solution') ?? findSection(rfc, 'solution')
  const actions = availableActions(rfc.status)
  const hasRun = !!rfc.protocol_run_id
  const canAct = hasRun && actions.length > 0 && onAction

  const isSingleContent = rfc.sections.length === 1 && rfc.sections[0].title === 'Content'
  const contentPreview = isSingleContent ? extractContentPreview(rfc.sections[0].content, 200) : null

  return (
    <Card
      onClick={onClick ? () => onClick(rfc.id) : undefined}
      className={`
        !rounded-xl border-l-[3px] ${statusBorder[rfc.status]} ${statusGlow[rfc.status]}
        ${onClick ? 'cursor-pointer hover:border-white/10 transition-all group' : ''}
        ${className}
      `}
    >
      <div className="p-4 space-y-3">
        {/* Row 1: Title + badges */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <FileText className="w-4 h-4 text-blue-400 shrink-0" />
              <h3 className="text-sm font-semibold text-gray-100 truncate">
                {rfc.title}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1" title={imp.label}>
              <span className={`w-2 h-2 rounded-full ${imp.dot}`} />
              <span className="text-[10px] text-gray-500">{imp.label}</span>
            </span>
            <RfcStatusBadge status={rfc.status} />
          </div>
        </div>

        {/* Row 2: Metadata */}
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(rfc.created_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Hash className="w-3 h-3" />
            {rfc.id.slice(0, 8)}
          </span>
          {rfc.sections.length > 1 && (
            <span className="inline-flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {rfc.sections.length} sections
            </span>
          )}
        </div>

        {/* Row 3: Content preview */}
        {contentPreview ? (
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 border-l-2 border-white/[0.06] pl-2.5">
            {contentPreview}
          </p>
        ) : (
          <div className="space-y-2">
            {problem && (
              <div className="border-l-2 border-blue-500/30 pl-2.5">
                <span className="text-[10px] font-semibold text-blue-400/70 uppercase tracking-wider">Problem</span>
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mt-0.5">
                  {truncate(problem, 150)}
                </p>
              </div>
            )}
            {solution && (
              <div className="border-l-2 border-green-500/30 pl-2.5">
                <span className="text-[10px] font-semibold text-green-400/70 uppercase tracking-wider">Solution</span>
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mt-0.5">
                  {truncate(solution, 150)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Row 4: Tags (compact, skip rfc-* internal tags) */}
        {rfc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {rfc.tags.filter((t) => !t.startsWith('rfc-')).slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded-md text-[10px] text-gray-500 bg-white/[0.04] border border-white/[0.06]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Row 5: Actions OR warning */}
        {canAct && (
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
            {actions.map((action) => {
              const cfg = actionConfig[action]
              const Icon = cfg.icon
              return (
                <button
                  key={action}
                  onClick={(e) => { e.stopPropagation(); onAction(rfc.id, action) }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${cfg.color}`}
                >
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </button>
              )
            })}
            {onClick && (
              <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors ml-auto" />
            )}
          </div>
        )}

        {!hasRun && actions.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-[11px] text-amber-500/60">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>No protocol run linked</span>
            </div>
            {onClick && (
              <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors ml-auto" />
            )}
          </div>
        )}

        {actions.length === 0 && onClick && (
          <div className="flex items-center pt-2 border-t border-white/[0.06]">
            <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors ml-auto" />
          </div>
        )}
      </div>
    </Card>
  )
}

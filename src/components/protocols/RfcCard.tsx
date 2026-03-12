/**
 * RfcCard — Card component for displaying an RFC summary.
 *
 * Shows title, creation date, importance badge, truncated content preview,
 * status badge, section count, creator, and action buttons (only when a
 * protocol run is linked).
 */

import { Calendar, FileText, ThumbsUp, ThumbsDown, User, Hash, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { RfcStatusBadge } from './RfcStatusBadge'
import type { Rfc, RfcStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RfcCardProps {
  rfc: Rfc
  /** Callback when an action button is clicked */
  onAction?: (rfcId: string, action: 'propose' | 'accept' | 'reject' | 'implement') => void
  /** Callback when the card itself is clicked */
  onClick?: (rfcId: string) => void
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const importanceConfig: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-500/15',    text: 'text-red-400' },
  high:     { bg: 'bg-orange-500/15', text: 'text-orange-400' },
  medium:   { bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
  low:      { bg: 'bg-gray-500/15',   text: 'text-gray-400' },
}

function findSection(rfc: Rfc, title: string): string | undefined {
  const section = rfc.sections.find(
    (s) => s.title.toLowerCase().includes(title.toLowerCase()),
  )
  return section?.content
}

/**
 * Extract a meaningful preview from markdown content.
 * Skips header lines, metadata lines (bold key: value), and blank lines.
 */
function extractContentPreview(content: string, maxLen: number): string {
  const lines = content.split('\n')
  const meaningful: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip headers, empty lines, horizontal rules, metadata-style lines
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    if (trimmed.startsWith('---')) continue
    if (trimmed.startsWith('**') && trimmed.includes(':')) continue
    meaningful.push(trimmed)
    if (meaningful.join(' ').length >= maxLen) break
  }
  const text = meaningful.join(' ')
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trimEnd() + '...'
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trimEnd() + '...'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Which action buttons to show based on current status */
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

  // For markdown-only RFCs (single "Content" section), extract a preview
  const isSingleContent = rfc.sections.length === 1 && rfc.sections[0].title === 'Content'
  const contentPreview = isSingleContent
    ? extractContentPreview(rfc.sections[0].content, 200)
    : null

  return (
    <Card
      onClick={onClick ? () => onClick(rfc.id) : undefined}
      className={className}
    >
      <CardContent className="space-y-3">
        {/* Header: title + badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <h3 className="font-semibold text-gray-100 truncate text-sm">
              {rfc.title}
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${imp.bg} ${imp.text}`}>
              {rfc.importance}
            </span>
            <RfcStatusBadge status={rfc.status} />
          </div>
        </div>

        {/* Metadata row: date, creator, sections count, ID */}
        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(rfc.created_at)}
          </span>
          {rfc.created_by && (
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3" />
              {rfc.created_by}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Hash className="w-3 h-3" />
            {rfc.id.slice(0, 8)}
          </span>
          {rfc.sections.length > 1 && (
            <span className="text-gray-600">
              {rfc.sections.length} sections
            </span>
          )}
        </div>

        {/* Content preview — structured sections OR markdown preview */}
        {contentPreview ? (
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">
            {contentPreview}
          </p>
        ) : (
          <>
            {problem && (
              <div className="space-y-0.5">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Problem
                </span>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {truncate(problem, 150)}
                </p>
              </div>
            )}
            {solution && (
              <div className="space-y-0.5">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Proposed Solution
                </span>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {truncate(solution, 150)}
                </p>
              </div>
            )}
          </>
        )}

        {/* Tags */}
        {rfc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {rfc.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 bg-white/[0.04] border border-white/[0.06]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons — only show if protocol run is linked */}
        {canAct && (
          <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
            {actions.includes('propose') && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction(rfc.id, 'propose') }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
              >
                Propose
              </button>
            )}
            {actions.includes('accept') && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction(rfc.id, 'accept') }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors"
              >
                <ThumbsUp className="w-3 h-3" />
                Accept
              </button>
            )}
            {actions.includes('reject') && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction(rfc.id, 'reject') }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
              >
                <ThumbsDown className="w-3 h-3" />
                Reject
              </button>
            )}
            {actions.includes('implement') && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction(rfc.id, 'implement') }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
              >
                Implement
              </button>
            )}
          </div>
        )}

        {/* Warning: no protocol run linked */}
        {!hasRun && actions.length > 0 && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-border-subtle text-[11px] text-amber-500/70">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span>No protocol run linked — transitions unavailable</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

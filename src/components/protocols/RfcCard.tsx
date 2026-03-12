/**
 * RfcCard — List item card for RFC documents.
 *
 * Layout:
 *   Row 1: Status dot + full-width title (no truncation on 2 lines)
 *   Row 2: Status badge + importance + date + sections
 *   Row 3: Content preview (if available)
 *   Row 4: Action buttons or warning
 */

import {
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Rocket,
  Send,
  ChevronRight,
  BookOpen,
  ArrowRight,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { RfcStatusBadge } from './RfcStatusBadge'
import type { Rfc, RfcStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const statusBorder: Record<RfcStatus, string> = {
  draft: 'border-l-gray-500', proposed: 'border-l-blue-500',
  accepted: 'border-l-green-500', implemented: 'border-l-emerald-500',
  rejected: 'border-l-red-500',
}

const impDot: Record<string, string> = {
  critical: 'bg-red-400', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-500',
}

// Trigger styles — same as RfcDetailPage
const triggerStyles: Record<string, { icon: typeof Send; cls: string }> = {
  propose:        { icon: Send,       cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20' },
  submit_review:  { icon: Send,       cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20' },
  accept:         { icon: ThumbsUp,   cls: 'text-green-400 bg-green-500/10 border-green-500/20 hover:bg-green-500/20' },
  reject:         { icon: ThumbsDown, cls: 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20' },
  supersede:      { icon: ThumbsDown, cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20' },
  revise:         { icon: Send,       cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20' },
  start_planning: { icon: Rocket,     cls: 'text-violet-400 bg-violet-500/10 border-violet-500/20 hover:bg-violet-500/20' },
  start_work:     { icon: Rocket,     cls: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' },
  complete:       { icon: Rocket,     cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20' },
  replan:         { icon: Send,       cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20' },
}
const defaultTriggerStyle = { icon: ArrowRight, cls: 'text-gray-300 bg-white/[0.06] border-white/[0.1] hover:bg-white/[0.1]' }

// Fallback transitions keyed by FSM state name (mirrors rfc-lifecycle FSM)
const FALLBACK_TRANSITIONS: Record<string, { trigger: string; target_state: string }[]> = {
  draft:        [{ trigger: 'propose', target_state: 'proposed' }],
  proposed:     [{ trigger: 'submit_review', target_state: 'under_review' }, { trigger: 'reject', target_state: 'rejected' }],
  under_review: [{ trigger: 'accept', target_state: 'accepted' }, { trigger: 'revise', target_state: 'proposed' }, { trigger: 'reject', target_state: 'rejected' }],
  accepted:     [{ trigger: 'start_planning', target_state: 'planning' }, { trigger: 'reject', target_state: 'rejected' }],
  planning:     [{ trigger: 'start_work', target_state: 'in_progress' }, { trigger: 'replan', target_state: 'accepted' }],
  in_progress:  [{ trigger: 'complete', target_state: 'implemented' }, { trigger: 'replan', target_state: 'planning' }],
  implemented:  [],
  rejected:     [],
  superseded:   [],
}

function formatTrigger(trigger: string): string {
  return trigger.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSection(rfc: Rfc, title: string) {
  return rfc.sections.find((s) => s.title.toLowerCase().includes(title.toLowerCase()))?.content
}

function extractPreview(content: string, max: number): string {
  const out: string[] = []
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('---') || (t.startsWith('**') && t.includes(':'))) continue
    out.push(t)
    if (out.join(' ').length >= max) break
  }
  const text = out.join(' ')
  return text.length <= max ? text : text.slice(0, max).trimEnd() + '…'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RfcCardProps {
  rfc: Rfc
  onAction?: (id: string, action: string) => void
  onClick?: (id: string) => void
  className?: string
}

export function RfcCard({ rfc, onAction, onClick, className = '' }: RfcCardProps) {
  const backendTransitions = rfc.available_transitions ?? []
  const transitions = backendTransitions.length > 0
    ? backendTransitions
    : FALLBACK_TRANSITIONS[rfc.current_state ?? rfc.status] ?? []
  const canAct = transitions.length > 0 && onAction

  const isMd = rfc.sections.length === 1 && rfc.sections[0].title === 'Content'
  const preview = isMd
    ? extractPreview(rfc.sections[0].content, 180)
    : findSection(rfc, 'problem') ?? findSection(rfc, 'proposed solution') ?? findSection(rfc, 'solution') ?? null

  return (
    <Card
      onClick={onClick ? () => onClick(rfc.id) : undefined}
      className={`
        !rounded-xl border-l-[3px] ${statusBorder[rfc.status]}
        ${onClick ? 'cursor-pointer hover:border-white/[0.12] transition-all group' : ''}
        ${className}
      `}
    >
      <div className="px-4 py-3.5 space-y-2.5">
        {/* Title — full width, wraps to 2 lines */}
        <h3 className="text-[13px] font-semibold text-gray-100 leading-snug line-clamp-2">
          {rfc.title}
        </h3>

        {/* Metadata row */}
        <div className="flex items-center gap-2 flex-wrap">
          <RfcStatusBadge status={rfc.status} />
          <span className={`w-2 h-2 rounded-full ${impDot[rfc.importance] ?? impDot.medium}`} title={rfc.importance} />
          <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {fmtDate(rfc.created_at)}
          </span>
          {rfc.sections.length > 1 && (
            <span className="text-[11px] text-gray-600 inline-flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {rfc.sections.length}
            </span>
          )}
          <span className="text-[10px] font-mono text-gray-700 ml-auto">{rfc.id.slice(0, 8)}</span>
        </div>

        {/* Preview */}
        {preview && (
          <p className="text-[12px] text-gray-500 leading-relaxed line-clamp-2">
            {typeof preview === 'string' && preview.length > 180 ? preview.slice(0, 180).trimEnd() + '…' : preview}
          </p>
        )}

        {/* Actions */}
        {canAct && (
          <div className="flex items-center gap-1.5 pt-2 border-t border-white/[0.05]">
            {transitions.map((t) => {
              const style = triggerStyles[t.trigger] ?? defaultTriggerStyle
              const Icon = style.icon
              return (
                <button key={t.trigger} onClick={(e) => { e.stopPropagation(); onAction!(rfc.id, t.trigger) }}
                  title={`→ ${t.target_state}`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors ${style.cls}`}>
                  <Icon className="w-3 h-3" />{formatTrigger(t.trigger)}
                </button>
              )
            })}
            {onClick && <ChevronRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-400 ml-auto" />}
          </div>
        )}
      </div>
    </Card>
  )
}

/**
 * RfcDetailPage — Full view of a single RFC document.
 *
 * Displays:
 *   - Header with title, status badge, importance, metadata
 *   - Action buttons for lifecycle transitions
 *   - Full content rendered as markdown-like sections
 *   - Tags
 *   - Protocol run link (if any)
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  FileText,
  Calendar,
  Hash,
  BookOpen,
  ThumbsUp,
  ThumbsDown,
  Rocket,
  Send,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Clock,
} from 'lucide-react'
import { PageShell, Button } from '@/components/ui'
import { RfcStatusBadge } from '@/components/protocols/RfcStatusBadge'
import { rfcApi } from '@/services/rfcApi'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { Rfc, RfcStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Visual config
// ---------------------------------------------------------------------------

const importanceConfig: Record<string, { dot: string; label: string; border: string }> = {
  critical: { dot: 'bg-red-400',    label: 'Critical', border: 'border-red-500/30' },
  high:     { dot: 'bg-orange-400', label: 'High',     border: 'border-orange-500/30' },
  medium:   { dot: 'bg-yellow-400', label: 'Medium',   border: 'border-yellow-500/30' },
  low:      { dot: 'bg-gray-400',   label: 'Low',      border: 'border-gray-500/30' },
}

const statusColor: Record<RfcStatus, string> = {
  draft:       'border-l-gray-500',
  proposed:    'border-l-blue-500',
  accepted:    'border-l-green-500',
  implemented: 'border-l-emerald-500',
  rejected:    'border-l-red-500',
}

const actionConfig = {
  propose:   { label: 'Propose',        icon: Send,       color: 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/25' },
  accept:    { label: 'Accept',         icon: ThumbsUp,   color: 'text-green-400 bg-green-500/10 border-green-500/20 hover:bg-green-500/25' },
  reject:    { label: 'Reject',         icon: ThumbsDown, color: 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/25' },
  implement: { label: 'Mark Implemented', icon: Rocket,   color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/25' },
} as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return `${months} month${months > 1 ? 's' : ''} ago`
}

function availableActions(status: RfcStatus): ('propose' | 'accept' | 'reject' | 'implement')[] {
  switch (status) {
    case 'draft':    return ['propose']
    case 'proposed': return ['accept', 'reject']
    case 'accepted': return ['implement']
    default:         return []
  }
}

/** Simple markdown-ish renderer: handles headers, bold, lists, code blocks */
function renderMarkdownContent(content: string): React.ReactNode {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeLines: string[] = []
  let codeKey = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${codeKey++}`} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3 text-xs text-gray-300 font-mono overflow-x-auto my-2">
            {codeLines.join('\n')}
          </pre>,
        )
        codeLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    const trimmed = line.trim()

    // Empty line → spacer
    if (!trimmed) {
      elements.push(<div key={i} className="h-2" />)
      continue
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="text-sm font-semibold text-gray-200 mt-4 mb-1">
          {trimmed.slice(4)}
        </h4>,
      )
      continue
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-gray-100 mt-5 mb-2">
          {trimmed.slice(3)}
        </h3>,
      )
      continue
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={i} className="text-lg font-bold text-gray-100 mt-6 mb-2">
          {trimmed.slice(2)}
        </h2>,
      )
      continue
    }

    // Horizontal rule
    if (trimmed === '---' || trimmed === '***') {
      elements.push(<hr key={i} className="border-white/[0.06] my-4" />)
      continue
    }

    // List items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex gap-2 text-sm text-gray-400 leading-relaxed pl-1">
          <span className="text-gray-600 shrink-0">•</span>
          <span>{trimmed.slice(2)}</span>
        </div>,
      )
      continue
    }

    // Numbered list
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/)
    if (numMatch) {
      elements.push(
        <div key={i} className="flex gap-2 text-sm text-gray-400 leading-relaxed pl-1">
          <span className="text-gray-600 shrink-0 tabular-nums">{numMatch[1]}.</span>
          <span>{numMatch[2]}</span>
        </div>,
      )
      continue
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-sm text-gray-400 leading-relaxed">
        {trimmed}
      </p>,
    )
  }

  return elements
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RfcDetailPage() {
  const { rfcId } = useParams<{ rfcId: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()

  const [rfc, setRfc] = useState<Rfc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState<string | null>(null)

  // Fetch RFC
  const fetchRfc = useCallback(async () => {
    if (!rfcId) return
    setLoading(true)
    setError(null)
    try {
      const data = await rfcApi.get(rfcId)
      setRfc(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RFC')
    } finally {
      setLoading(false)
    }
  }, [rfcId])

  useEffect(() => {
    fetchRfc()
  }, [fetchRfc])

  // Handle transition action
  const handleAction = useCallback(
    async (action: 'propose' | 'accept' | 'reject' | 'implement') => {
      if (!rfcId) return
      setActionError(null)
      setTransitioning(action)
      try {
        const updated = await rfcApi.transition(rfcId, action)
        setRfc(updated)
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Failed to ${action} RFC`
        const match = msg.match(/"error":"([^"]+)"/)
        setActionError(match ? match[1] : msg)
        setTimeout(() => setActionError(null), 8000)
      } finally {
        setTransitioning(null)
      }
    },
    [rfcId],
  )

  const goBack = () => navigate(workspacePath(wsSlug, '/rfcs'))

  // Loading state
  if (loading) {
    return (
      <PageShell title="RFC" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
        </div>
      </PageShell>
    )
  }

  // Error state
  if (error || !rfc) {
    return (
      <PageShell title="RFC" description="Error">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertTriangle className="w-10 h-10 text-red-400/60" />
          <p className="text-sm text-red-400">{error ?? 'RFC not found'}</p>
          <Button variant="secondary" onClick={goBack}>Back to RFCs</Button>
        </div>
      </PageShell>
    )
  }

  const imp = importanceConfig[rfc.importance] ?? importanceConfig.medium
  const actions = availableActions(rfc.status)
  const hasRun = !!rfc.protocol_run_id
  const isSingleContent = rfc.sections.length === 1 && rfc.sections[0].title === 'Content'

  return (
    <PageShell
      title=""
      actions={
        <Button variant="secondary" onClick={goBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to RFCs
        </Button>
      }
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ── Header card ─────────────────────────────────────────────── */}
        <div className={`rounded-xl border border-white/[0.06] bg-white/[0.02] border-l-[4px] ${statusColor[rfc.status]} p-6 space-y-4`}>
          {/* Title row */}
          <div className="flex items-start gap-3">
            <FileText className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-gray-100">{rfc.title}</h1>
            </div>
          </div>

          {/* Badges row */}
          <div className="flex items-center gap-3 flex-wrap">
            <RfcStatusBadge status={rfc.status} />
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border ${imp.border} bg-white/[0.03]`}>
              <span className={`w-2 h-2 rounded-full ${imp.dot}`} />
              {imp.label}
            </span>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(rfc.created_at)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formatRelativeTime(rfc.created_at)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5" />
              <span className="font-mono">{rfc.id.slice(0, 12)}</span>
            </span>
            {rfc.sections.length > 1 && (
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                {rfc.sections.length} sections
              </span>
            )}
            {rfc.protocol_run_id && (
              <button
                onClick={() => navigate(workspacePath(wsSlug, `/protocols`))}
                className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Protocol run
              </button>
            )}
          </div>

          {/* Tags */}
          {rfc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {rfc.tags.filter((t) => !t.startsWith('rfc-')).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md text-[11px] text-gray-400 bg-white/[0.04] border border-white/[0.06]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          {actions.length > 0 && (
            <div className="flex items-center gap-3 pt-3 border-t border-white/[0.06]">
              {hasRun ? (
                actions.map((action) => {
                  const cfg = actionConfig[action]
                  const Icon = cfg.icon
                  const isTransitioning = transitioning === action
                  return (
                    <button
                      key={action}
                      onClick={() => handleAction(action)}
                      disabled={!!transitioning}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all active:scale-95 disabled:opacity-50 ${cfg.color}`}
                    >
                      {isTransitioning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                      {cfg.label}
                    </button>
                  )
                })
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-500/70">
                  <AlertTriangle className="w-4 h-4" />
                  No protocol run linked — transitions unavailable
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Error toast ─────────────────────────────────────────────── */}
        {actionError && (
          <div className="px-4 py-3 rounded-xl text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="text-amber-400 hover:text-amber-200 text-xs font-medium shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Content sections ────────────────────────────────────────── */}
        {isSingleContent ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
            {renderMarkdownContent(rfc.sections[0].content)}
          </div>
        ) : (
          <div className="space-y-4">
            {rfc.sections.map((section, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                  <h2 className="text-sm font-semibold text-gray-200">{section.title}</h2>
                </div>
                <div className="px-5 py-4">
                  {renderMarkdownContent(section.content)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}

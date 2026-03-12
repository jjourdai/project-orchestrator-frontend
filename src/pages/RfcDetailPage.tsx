/**
 * RfcDetailPage — Full view of a single RFC document.
 *
 * Layout:
 *   - PageHeader with title, status badge, importance, metadata
 *   - SectionNav for quick-jump between sections
 *   - Lifecycle progress bar showing the RFC journey
 *   - Full content rendered via CollapsibleMarkdown per section
 *   - Tags, linked protocol run, action buttons
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FileText,
  Calendar,
  Hash,
  BookOpen,
  ThumbsUp,
  ThumbsDown,
  Rocket,
  Send,
  AlertTriangle,
  ExternalLink,
  Tag,
  CheckCircle2,
  Circle,
  ArrowRight,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CollapsibleMarkdown,
  SectionNav,
  LoadingPage,
  ErrorState,
  Badge,
} from '@/components/ui'
import { RfcStatusBadge } from '@/components/protocols/RfcStatusBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { rfcApi } from '@/services/rfcApi'
import { useWorkspaceSlug, useSectionObserver, useToast } from '@/hooks'
import { useViewTransition } from '@/hooks/useViewTransition'
import { workspacePath } from '@/utils/paths'
import type { Rfc, RfcStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Visual config
// ---------------------------------------------------------------------------

const importanceConfig: Record<string, { dot: string; label: string; variant: 'error' | 'warning' | 'default' | 'success' }> = {
  critical: { dot: 'bg-red-400',    label: 'Critical', variant: 'error' },
  high:     { dot: 'bg-orange-400', label: 'High',     variant: 'warning' },
  medium:   { dot: 'bg-yellow-400', label: 'Medium',   variant: 'default' },
  low:      { dot: 'bg-gray-400',   label: 'Low',      variant: 'default' },
}

const actionConfig = {
  propose:   { label: 'Propose',          icon: Send,       cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/25' },
  accept:    { label: 'Accept',           icon: ThumbsUp,   cls: 'text-green-400 bg-green-500/10 border-green-500/20 hover:bg-green-500/25' },
  reject:    { label: 'Reject',           icon: ThumbsDown, cls: 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/25' },
  implement: { label: 'Mark Implemented', icon: Rocket,     cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/25' },
} as const

// ---------------------------------------------------------------------------
// Lifecycle pipeline steps
// ---------------------------------------------------------------------------

const LIFECYCLE_STEPS: { key: RfcStatus; label: string }[] = [
  { key: 'draft',       label: 'Draft' },
  { key: 'proposed',    label: 'Proposed' },
  { key: 'accepted',    label: 'Accepted' },
  { key: 'implemented', label: 'Implemented' },
]

function getLifecycleIndex(status: RfcStatus): number {
  if (status === 'rejected') return -1
  return LIFECYCLE_STEPS.findIndex((s) => s.key === status)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
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

// ---------------------------------------------------------------------------
// Section nav config
// ---------------------------------------------------------------------------

function buildSections(rfc: Rfc) {
  const sections = [{ id: 'overview', label: 'Overview' }]
  if (rfc.sections.length > 1) {
    sections.push({ id: 'content', label: `Content (${rfc.sections.length})` })
  } else {
    sections.push({ id: 'content', label: 'Content' })
  }
  if (rfc.tags.length > 0) {
    sections.push({ id: 'tags', label: `Tags (${rfc.tags.filter((t) => !t.startsWith('rfc-')).length})` })
  }
  sections.push({ id: 'actions', label: 'Actions' })
  return sections
}

// ---------------------------------------------------------------------------
// Lifecycle Progress Component
// ---------------------------------------------------------------------------

function LifecycleProgress({ status }: { status: RfcStatus }) {
  const activeIdx = getLifecycleIndex(status)
  const isRejected = status === 'rejected'

  return (
    <div className="flex items-center gap-0">
      {LIFECYCLE_STEPS.map((step, idx) => {
        const isCompleted = !isRejected && idx < activeIdx
        const isCurrent = !isRejected && idx === activeIdx
        const isPending = !isRejected && idx > activeIdx

        return (
          <div key={step.key} className="flex items-center">
            {/* Step */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all
                  ${isCompleted ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : ''}
                  ${isCurrent ? 'bg-blue-500/20 border-blue-400 text-blue-400 ring-2 ring-blue-500/20' : ''}
                  ${isPending ? 'bg-white/[0.04] border-white/[0.08] text-gray-600' : ''}
                  ${isRejected ? 'bg-white/[0.04] border-white/[0.08] text-gray-600' : ''}
                `}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap
                  ${isCompleted ? 'text-emerald-400' : ''}
                  ${isCurrent ? 'text-blue-400' : ''}
                  ${isPending || isRejected ? 'text-gray-600' : ''}
                `}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {idx < LIFECYCLE_STEPS.length - 1 && (
              <div
                className={`w-8 h-0.5 mx-1 mb-5 rounded-full ${
                  !isRejected && idx < activeIdx
                    ? 'bg-emerald-500/40'
                    : 'bg-white/[0.06]'
                }`}
              />
            )}
          </div>
        )
      })}

      {/* Rejected state — separate indicator */}
      {isRejected && (
        <>
          <div className="w-8 h-0.5 mx-1 mb-5 rounded-full bg-red-500/30" />
          <div className="flex flex-col items-center gap-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center border-2 bg-red-500/20 border-red-500/50 text-red-400 ring-2 ring-red-500/20">
              <AlertTriangle className="w-3 h-3" />
            </div>
            <span className="text-[10px] font-medium text-red-400">Rejected</span>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RfcDetailPage() {
  const { rfcId } = useParams<{ rfcId: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const { navigate: viewNav } = useViewTransition()

  const [rfc, setRfc] = useState<Rfc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState<string | null>(null)

  const sections = rfc ? buildSections(rfc) : []
  const activeSection = useSectionObserver(sections.map((s) => s.id))

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
      setTransitioning(action)
      try {
        const updated = await rfcApi.transition(rfcId, action)
        setRfc(updated)
        toast.success(`RFC ${action === 'implement' ? 'marked as implemented' : action + 'd'} successfully`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Failed to ${action} RFC`
        const match = msg.match(/"error":"([^"]+)"/)
        toast.error(match ? match[1] : msg)
      } finally {
        setTransitioning(null)
      }
    },
    [rfcId, toast],
  )

  const goBack = () => viewNav(workspacePath(wsSlug, '/rfcs'), { type: 'back-button' })

  // Loading / Error states
  if (loading) return <LoadingPage />
  if (error || !rfc) {
    return (
      <ErrorState
        title="RFC not found"
        description={error || 'Could not load this RFC document.'}
        onRetry={fetchRfc}
      />
    )
  }

  const imp = importanceConfig[rfc.importance] ?? importanceConfig.medium
  const actions = availableActions(rfc.status)
  const hasRun = !!rfc.protocol_run_id
  const isSingleContent = rfc.sections.length === 1 && rfc.sections[0].title === 'Content'
  const visibleTags = rfc.tags.filter((t) => !t.startsWith('rfc-'))

  return (
    <div className="pt-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title={rfc.title}
        status={<RfcStatusBadge status={rfc.status} />}
        metadata={[
          { label: 'Created', value: relativeTime(rfc.created_at) },
          ...(rfc.updated_at ? [{ label: 'Updated', value: relativeTime(rfc.updated_at) }] : []),
        ]}
        actions={
          <button
            onClick={goBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            Back to RFCs
          </button>
        }
      >
        <Badge variant={imp.variant}>
          <span className={`w-2 h-2 rounded-full ${imp.dot} mr-1`} />
          {imp.label}
        </Badge>
      </PageHeader>

      <SectionNav sections={sections} activeSection={activeSection} />

      {/* ── Overview Section ────────────────────────────────────────────── */}
      <section id="overview" className="scroll-mt-20 space-y-4">
        {/* Lifecycle progress */}
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-2">
              <LifecycleProgress status={rfc.status} />
            </div>
          </CardContent>
        </Card>

        {/* Metadata card */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Status</p>
                <RfcStatusBadge status={rfc.status} />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Importance</p>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${imp.dot}`} />
                  <span className="text-sm text-gray-300">{imp.label}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Created</p>
                <div className="flex items-center gap-1.5 text-sm text-gray-300">
                  <Calendar className="w-3.5 h-3.5 text-gray-500" />
                  {formatDate(rfc.created_at)}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Sections</p>
                <div className="flex items-center gap-1.5 text-sm text-gray-300">
                  <BookOpen className="w-3.5 h-3.5 text-gray-500" />
                  {rfc.sections.length} {rfc.sections.length === 1 ? 'section' : 'sections'}
                </div>
              </div>
            </div>

            {/* IDs row */}
            <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-4 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <Hash className="w-3 h-3" />
                <span className="font-mono">{rfc.id.slice(0, 12)}</span>
              </span>
              {rfc.protocol_run_id && (
                <button
                  onClick={() => navigate(workspacePath(wsSlug, '/protocols'))}
                  className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Protocol run
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
              {!rfc.protocol_run_id && (
                <span className="inline-flex items-center gap-1 text-amber-500/50">
                  <AlertTriangle className="w-3 h-3" />
                  No protocol run linked
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Content Section ─────────────────────────────────────────────── */}
      <section id="content" className="scroll-mt-20 space-y-4">
        {isSingleContent ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <FileText className="w-4 h-4 mr-1.5 inline" />
                Content
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CollapsibleMarkdown content={rfc.sections[0].content} maxHeight={600} />
            </CardContent>
          </Card>
        ) : (
          rfc.sections.map((section, idx) => (
            <Card key={idx}>
              <CardHeader>
                <CardTitle>
                  <BookOpen className="w-4 h-4 mr-1.5 inline text-gray-500" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CollapsibleMarkdown content={section.content} maxHeight={400} />
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* ── Tags Section ────────────────────────────────────────────────── */}
      {visibleTags.length > 0 && (
        <section id="tags" className="scroll-mt-20">
          <Card>
            <CardHeader>
              <CardTitle>
                <Tag className="w-4 h-4 mr-1.5 inline text-gray-500" />
                Tags ({visibleTags.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {visibleTags.map((tag) => (
                  <Badge key={tag} variant="default">{tag}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Actions Section ─────────────────────────────────────────────── */}
      <section id="actions" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <div className="flex items-center gap-3 py-2">
                <CheckCircle2 className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-400">No actions available</p>
                  <p className="text-xs text-gray-600">
                    {rfc.status === 'implemented'
                      ? 'This RFC has been fully implemented.'
                      : rfc.status === 'rejected'
                        ? 'This RFC has been rejected.'
                        : 'No transitions are available for the current state.'}
                  </p>
                </div>
              </div>
            ) : !hasRun ? (
              <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <AlertTriangle className="w-5 h-5 text-amber-500/70 shrink-0" />
                <div>
                  <p className="text-sm text-amber-400">No protocol run linked</p>
                  <p className="text-xs text-amber-500/50">
                    Lifecycle transitions require a linked protocol run. Create one from the Protocols page.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Available transitions for <span className="text-gray-400 font-medium">{rfc.status}</span> state:
                </p>
                <div className="flex flex-wrap gap-3">
                  {actions.map((action) => {
                    const cfg = actionConfig[action]
                    const Icon = cfg.icon
                    const isLoading = transitioning === action
                    return (
                      <button
                        key={action}
                        onClick={() => handleAction(action)}
                        disabled={!!transitioning}
                        className={`
                          inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
                          border transition-all active:scale-[0.97] disabled:opacity-50 ${cfg.cls}
                        `}
                      >
                        {isLoading ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Icon className="w-4 h-4" />
                        )}
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

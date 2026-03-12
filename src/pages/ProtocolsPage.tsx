/**
 * ProtocolsPage — List view for all protocols in the current project.
 *
 * Features:
 *   - Status filter tabs (All / Draft / Active / Archived)
 *   - Responsive grid of ProtocolCard components
 *   - Loading, error, and empty states
 *   - Refresh button
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'

import { protocolApi, workspacesApi } from '@/services'
import { ProtocolCard } from '@/components/protocols/ProtocolCard'
import { ScheduledActionsPanel } from '@/components/protocols/ScheduledActionsPanel'
import { RecentRunsPanel } from '@/components/protocols/RecentRunsPanel'
import {
  PageShell,
  Button,
  Select,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type { Protocol, ProtocolStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Filter config
// ---------------------------------------------------------------------------

type StatusTab = 'all' | ProtocolStatus | 'scheduled' | 'activity'

const statusTabs: { value: StatusTab; label: string }[] = [
  { value: 'activity', label: 'FSM Activity' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProtocolsPage() {
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()

  // ── Project selector (local state, same pattern as SkillsPage) ─────
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([])
  const [projectFilter, setProjectFilter] = useState<string>('all')

  useEffect(() => {
    if (!wsSlug) return
    workspacesApi
      .listProjects(wsSlug)
      .then(setProjects)
      .catch(() => {})
  }, [wsSlug])

  const activeProjectId = projectFilter !== 'all' ? projectFilter : undefined

  const projectOptions = useMemo(
    () => [
      { value: 'all', label: 'Workspace' },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects],
  )

  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusTab>('activity')
  const [refreshKey, setRefreshKey] = useState(0)

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchProtocols = useCallback(async () => {
    if (projects.length === 0) {
      setProtocols([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const statusParam = statusFilter !== 'all' && statusFilter !== 'scheduled' && statusFilter !== 'activity' ? statusFilter : undefined
    try {
      if (activeProjectId) {
        // Single project selected
        const res = await protocolApi.listProtocols({
          project_id: activeProjectId,
          status: statusParam,
          limit: 100,
          offset: 0,
        })
        setProtocols(res.items)
        setTotal(res.total)
      } else {
        // Workspace mode: fetch from all projects in parallel and merge
        const results = await Promise.all(
          projects.map((p) =>
            protocolApi.listProtocols({ project_id: p.id, status: statusParam, limit: 100, offset: 0 }).catch(() => ({ items: [] as Protocol[], total: 0 })),
          ),
        )
        const merged = results.flatMap((r) => r.items)
        // Deduplicate by id (in case of overlap)
        const seen = new Set<string>()
        const unique = merged.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
        setProtocols(unique)
        setTotal(unique.length)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load protocols')
    } finally {
      setLoading(false)
    }
  }, [activeProjectId, projects, statusFilter, refreshKey])

  useEffect(() => {
    fetchProtocols()
  }, [fetchProtocols])

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleRefresh = () => setRefreshKey((k) => k + 1)

  const handleCardClick = (protocolId: string) => {
    navigate(workspacePath(wsSlug, `/protocols/${protocolId}`))
  }

  const handleRunClick = (protocolId: string, _runId: string) => {
    navigate(workspacePath(wsSlug, `/protocols/${protocolId}`))
  }

  return (
    <PageShell
      title="Protocols"
      description="FSM-based protocol engine"
      actions={
        <div className="flex items-center gap-2">
          <Select
            options={projectOptions}
            value={projectFilter}
            onChange={setProjectFilter}
          />
          <Button variant="secondary" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      }
    >
      {/* Status filter tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06]">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              statusFilter === tab.value
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {!activeProjectId && projects.length === 0 ? (
        <EmptyState
          title="No projects in workspace"
          description="Add a project to this workspace to view its protocols."
        />
      ) : error ? (
        <ErrorState title="Failed to load protocols" description={error} onRetry={handleRefresh} />
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : statusFilter === 'activity' ? (
        <RecentRunsPanel
          protocols={protocols}
          onRunClick={handleRunClick}
        />
      ) : statusFilter === 'scheduled' ? (
        <ScheduledActionsPanel
          protocols={protocols}
          onTrigger={handleRefresh}
        />
      ) : protocols.length === 0 ? (
        <EmptyState
          title="No protocols found"
          description={
            statusFilter === 'all'
              ? 'This project has no protocols yet.'
              : `No protocols match the "${statusFilter}" filter.`
          }
          action={
            statusFilter !== 'all' ? (
              <Button variant="secondary" onClick={() => setStatusFilter('all')}>
                Clear filter
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {protocols.map((protocol) => (
            <ProtocolCard
              key={protocol.id}
              protocol={protocol}
              onClick={() => handleCardClick(protocol.id)}
            />
          ))}
        </div>
      )}
    </PageShell>
  )
}

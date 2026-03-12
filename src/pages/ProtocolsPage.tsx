/**
 * ProtocolsPage — List view for all protocols in the current project.
 *
 * Features:
 *   - Status filter tabs (All / Draft / Active / Archived)
 *   - Responsive grid of ProtocolCard components
 *   - Loading, error, and empty states
 *   - Refresh button
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { RefreshCw } from 'lucide-react'

import { selectedProjectAtom } from '@/atoms/projects'
import { protocolApi } from '@/services'
import { ProtocolCard } from '@/components/protocols/ProtocolCard'
import {
  PageShell,
  Button,
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

type StatusTab = 'all' | ProtocolStatus

const statusTabs: { value: StatusTab; label: string }[] = [
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
  const selectedProject = useAtomValue(selectedProjectAtom)
  const projectId = selectedProject?.id

  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusTab>('all')
  const [refreshKey, setRefreshKey] = useState(0)

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchProtocols = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await protocolApi.listProtocols({
        project_id: projectId,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: 100,
        offset: 0,
      })
      setProtocols(res.items)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load protocols')
    } finally {
      setLoading(false)
    }
  }, [projectId, statusFilter, refreshKey])

  useEffect(() => {
    fetchProtocols()
  }, [fetchProtocols])

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleRefresh = () => setRefreshKey((k) => k + 1)

  const handleCardClick = (protocolId: string) => {
    navigate(workspacePath(wsSlug, `/protocols/${protocolId}`))
  }

  // ── No project selected ──────────────────────────────────────────────
  if (!projectId) {
    return (
      <PageShell title="Protocols" description="FSM-based protocol engine">
        <EmptyState
          title="No project selected"
          description="Select a project to view its protocols."
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Protocols"
      description="FSM-based protocol engine"
      actions={
        <Button variant="secondary" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
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
      {error ? (
        <ErrorState title="Failed to load protocols" description={error} onRetry={handleRefresh} />
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
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

/**
 * RfcDashboardPage — Dashboard for managing RFC documents.
 *
 * Fetches RFCs via the rfcApi, provides filter tabs by status, and renders
 * a responsive grid of RfcCard components.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { FileText, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { RfcCard } from './RfcCard'
import { rfcApi } from '@/services/rfcApi'
import type { Rfc, RfcStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

interface StatusTab {
  key: RfcStatus | 'all'
  label: string
  color: string
}

const STATUS_TABS: StatusTab[] = [
  { key: 'all',         label: 'All',         color: 'text-gray-400' },
  { key: 'draft',       label: 'Draft',       color: 'text-gray-400' },
  { key: 'proposed',    label: 'Proposed',    color: 'text-blue-400' },
  { key: 'accepted',    label: 'Accepted',    color: 'text-green-400' },
  { key: 'implemented', label: 'Implemented', color: 'text-emerald-400' },
  { key: 'rejected',    label: 'Rejected',    color: 'text-red-400' },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RfcDashboardPageProps {
  /** Callback when an RFC card is clicked */
  onRfcClick?: (rfcId: string) => void
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RfcDashboardPage({ onRfcClick, className = '' }: RfcDashboardPageProps) {
  const [rfcs, setRfcs] = useState<Rfc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<RfcStatus | 'all'>('all')

  // Fetch RFCs
  const fetchRfcs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await rfcApi.list({ limit: 200 })
      setRfcs(response.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RFCs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRfcs()
  }, [fetchRfcs])

  // Filter by active tab
  const filteredRfcs = useMemo(() => {
    if (activeTab === 'all') return rfcs
    return rfcs.filter((rfc) => rfc.status === activeTab)
  }, [rfcs, activeTab])

  // Count by status for tab badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rfcs.length }
    for (const rfc of rfcs) {
      counts[rfc.status] = (counts[rfc.status] ?? 0) + 1
    }
    return counts
  }, [rfcs])

  // Handle RFC action (transition)
  const handleAction = useCallback(
    async (rfcId: string, action: 'propose' | 'accept' | 'reject' | 'implement') => {
      try {
        const updated = await rfcApi.transition(rfcId, action)
        setRfcs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      } catch (err) {
        console.error(`Failed to ${action} RFC:`, err)
      }
    },
    [],
  )

  // --- Render ---

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-semibold text-gray-100">RFCs</h1>
          {!loading && (
            <span className="text-xs text-gray-500 tabular-nums">
              {filteredRfcs.length} {filteredRfcs.length === 1 ? 'document' : 'documents'}
            </span>
          )}
        </div>

        <button
          onClick={fetchRfcs}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border-subtle overflow-x-auto scrollbar-thin">
        {STATUS_TABS.map((tab) => {
          const count = statusCounts[tab.key] ?? 0
          const isActive = activeTab === tab.key

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
                ${isActive
                  ? 'bg-white/[0.08] text-gray-100 border border-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border border-transparent'
                }
              `}
            >
              {tab.label}
              {count > 0 && (
                <span className={`px-1.5 py-0 rounded-full text-[10px] tabular-nums ${isActive ? 'bg-white/[0.08]' : 'bg-white/[0.04]'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && rfcs.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <AlertCircle className="w-8 h-8 text-red-400/60" />
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={fetchRfcs}
              className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : filteredRfcs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <FileText className="w-8 h-8 text-gray-600" />
            <p className="text-sm text-gray-500">
              {activeTab === 'all' ? 'No RFCs found' : `No ${activeTab} RFCs`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredRfcs.map((rfc) => (
              <RfcCard
                key={rfc.id}
                rfc={rfc}
                onAction={handleAction}
                onClick={onRfcClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { X, Plug, Circle, RefreshCw, ChevronRight } from 'lucide-react'
import { mcpFederationApi, type McpServerSummary, type EffectiveMcp } from '@/services/mcpFederation'
import { workspacePath } from '@/utils/paths'

interface FederationPanelProps {
  open: boolean
  onClose: () => void
}

export function FederationPanel({ open, onClose }: FederationPanelProps) {
  const { slug: wsSlug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [servers, setServers] = useState<McpServerSummary[]>([])
  const [effectiveMcps, setEffectiveMcps] = useState<EffectiveMcp[]>([])
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [serverList, effective] = await Promise.all([
        mcpFederationApi.listServers(),
        wsSlug
          ? mcpFederationApi.getWorkspaceEffectiveMcps(wsSlug)
          : mcpFederationApi.resolveEffectiveMcps({}),
      ])
      setServers(serverList)
      setEffectiveMcps(effective)
    } catch {
      // silently fail — panel is informational
    } finally {
      setLoading(false)
    }
  }, [wsSlug])

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open, loadData])

  const statusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-emerald-400'
      case 'disconnected': return 'text-gray-500'
      case 'error': return 'text-red-400'
      case 'reconnecting': return 'text-amber-400 animate-pulse'
      default: return 'text-gray-500'
    }
  }

  const stateColor = (state: string) => {
    switch (state) {
      case 'enabled': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      case 'excluded': return 'bg-red-500/15 text-red-400 border-red-500/30'
      default: return 'bg-gray-500/15 text-gray-400 border-gray-500/30'
    }
  }

  const enabledCount = effectiveMcps.filter(m => m.state === 'enabled').length

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-96 max-w-[90vw] bg-surface-raised border-l border-border-subtle shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-semibold text-gray-200">MCP Federation</h2>
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
              {enabledCount} active
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 text-gray-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Connected Servers */}
              <section>
                <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                  Connected Servers ({servers.length})
                </h3>
                {servers.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No servers connected</p>
                ) : (
                  <div className="space-y-1.5">
                    {servers.map((server) => (
                      <div
                        key={server.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                      >
                        <Circle className={`w-2.5 h-2.5 fill-current ${statusColor(server.status)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-200 truncate">
                            {server.display_name || server.id}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {server.transport_type} · {server.tool_count} tools
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Effective MCPs for current workspace */}
              {effectiveMcps.length > 0 && (
                <section>
                  <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                    Effective MCPs {wsSlug ? `(${wsSlug})` : '(global)'}
                  </h3>
                  <div className="space-y-1.5">
                    {effectiveMcps.map((mcp) => (
                      <div
                        key={mcp.server_id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-200 truncate">{mcp.display_name}</div>
                          <div className="text-[10px] text-gray-500">
                            via {mcp.resolved_by.scope_type}
                            {mcp.resolution_chain.length > 1 && (
                              <span className="ml-1">
                                ({mcp.resolution_chain.map(s => s.level[0].toUpperCase()).join(' → ')})
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${stateColor(mcp.state)}`}>
                          {mcp.state}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer — link to full page */}
        <div className="border-t border-border-subtle p-3">
          <button
            onClick={() => {
              onClose()
              if (wsSlug) navigate(workspacePath(wsSlug, '/mcp-federation'))
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
          >
            <span>View full federation settings</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  )
}

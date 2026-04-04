import { useState, useEffect, useCallback } from 'react'
import { Globe, Building2, FolderOpen, ArrowDown, Check, X as XIcon, Minus, RefreshCw } from 'lucide-react'
import { mcpFederationApi, type McpAssignment, type EffectiveMcp, type McpScopeType } from '@/services/mcpFederation'

// ── Types ────────────────────────────────────────────────────────────────

interface CascadeFlowViewProps {
  /** Focus on a specific workspace (shows all its projects) */
  workspaceSlug?: string
  workspaceId?: string
  /** Focus on a specific project */
  projectSlug?: string
  projectId?: string
  /** Compact mode (no full tier labels) */
  compact?: boolean
}

interface TierData {
  level: McpScopeType
  label: string
  icon: typeof Globe
  scopeId?: string
  assignments: McpAssignment[]
  effectiveMcps: EffectiveMcp[]
}

// ── State colors ─────────────────────────────────────────────────────────

const stateStyles: Record<string, { bg: string; text: string; border: string; icon: typeof Check }> = {
  enabled: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: Check },
  excluded: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', icon: XIcon },
  inherited: { bg: 'bg-gray-500/5', text: 'text-gray-500', border: 'border-gray-500/20', icon: Minus },
}

// ── Component ────────────────────────────────────────────────────────────

export function CascadeFlowView({
  workspaceSlug,
  workspaceId,
  projectSlug,
  projectId,
  compact = false,
}: CascadeFlowViewProps) {
  const [tiers, setTiers] = useState<TierData[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Build tier data
      const tierList: TierData[] = []

      // Tier 1: Global
      const globalAssignments = await mcpFederationApi.resolveEffectiveMcps({})
      tierList.push({
        level: 'global',
        label: 'Global',
        icon: Globe,
        assignments: [], // we don't need raw assignments for display, just effective
        effectiveMcps: globalAssignments,
      })

      // Tier 2: Workspace (if specified)
      if (workspaceSlug || workspaceId) {
        const wsEffective = workspaceSlug
          ? await mcpFederationApi.getWorkspaceEffectiveMcps(workspaceSlug)
          : await mcpFederationApi.resolveEffectiveMcps({ workspace_id: workspaceId })
        tierList.push({
          level: 'workspace',
          label: workspaceSlug || 'Workspace',
          icon: Building2,
          scopeId: workspaceId,
          assignments: [],
          effectiveMcps: wsEffective,
        })
      }

      // Tier 3: Project (if specified)
      if (projectSlug || projectId) {
        const projEffective = projectSlug
          ? await mcpFederationApi.getProjectEffectiveMcps(projectSlug)
          : await mcpFederationApi.resolveEffectiveMcps({ project_id: projectId })
        tierList.push({
          level: 'project',
          label: projectSlug || 'Project',
          icon: FolderOpen,
          scopeId: projectId,
          assignments: [],
          effectiveMcps: projEffective,
        })
      }

      setTiers(tierList)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [workspaceSlug, workspaceId, projectSlug, projectId])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 text-gray-500 animate-spin" />
      </div>
    )
  }

  if (tiers.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No cascade data available
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {tiers.map((tier, tierIdx) => (
        <div key={tier.level}>
          {/* Connector arrow between tiers */}
          {tierIdx > 0 && (
            <div className="flex justify-center py-2">
              <ArrowDown className="w-4 h-4 text-gray-600" />
            </div>
          )}

          {/* Tier box */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
            {/* Tier header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.02]">
              <tier.icon className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {tier.label}
              </span>
              <span className="ml-auto text-[10px] text-gray-500">
                {tier.effectiveMcps.filter(m => m.state === 'enabled').length} enabled
              </span>
            </div>

            {/* MCP nodes grid */}
            <div className="p-3">
              {tier.effectiveMcps.length === 0 ? (
                <p className="text-xs text-gray-600 italic text-center py-2">No MCPs at this level</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tier.effectiveMcps.map((mcp) => {
                    // Determine if this MCP was set at THIS tier level or inherited
                    const assignedHere = mcp.resolved_by.scope_type === tier.level
                    const displayState = assignedHere ? mcp.state : 'inherited'
                    const style = stateStyles[displayState] || stateStyles.inherited

                    return (
                      <div
                        key={mcp.server_id}
                        className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-default ${style.bg} ${style.border} hover:border-opacity-60`}
                        title={`${mcp.display_name}: ${mcp.state} (resolved via ${mcp.resolved_by.scope_type})`}
                      >
                        <style.icon className={`w-3.5 h-3.5 ${style.text}`} />
                        <span className={`text-xs font-medium ${assignedHere ? 'text-gray-200' : 'text-gray-500'}`}>
                          {mcp.display_name}
                        </span>

                        {/* Tooltip on hover — resolution chain */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                          <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 shadow-xl min-w-[160px]">
                            <div className="text-[10px] text-gray-400 mb-1 font-medium">Resolution chain</div>
                            {mcp.resolution_chain.map((step, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                                <span className="text-gray-500 capitalize w-16">{step.level}</span>
                                <span className={
                                  step.state === 'enabled' ? 'text-emerald-400' :
                                  step.state === 'excluded' ? 'text-red-400' :
                                  'text-gray-600'
                                }>
                                  {step.state}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Effective summary bar */}
            {!compact && (
              <div className="px-4 py-2 border-t border-white/[0.04] bg-white/[0.01]">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <span className="font-medium">Effective:</span>
                  {tier.effectiveMcps
                    .filter(m => m.state === 'enabled')
                    .map((m, i) => (
                      <span key={m.server_id}>
                        {i > 0 && <span className="text-gray-700">, </span>}
                        <span className="text-emerald-400/70">{m.display_name}</span>
                      </span>
                    ))
                  }
                  {tier.effectiveMcps.filter(m => m.state === 'enabled').length === 0 && (
                    <span className="italic text-gray-600">none</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

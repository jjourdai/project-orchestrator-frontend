import { api } from './api'

// ── Types ────────────────────────────────────────────────────────────────

export type McpTransportType = 'stdio' | 'sse' | 'streamable_http'

export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'reconnecting'

export type CircuitState = 'closed' | 'open' | 'half_open'

export type InferredCategory = 'query' | 'mutation' | 'search' | 'create' | 'delete' | 'unknown'

export type ResponseShape = 'object' | 'array' | 'scalar' | 'error' | 'not_probed'

export interface ServerStats {
  call_count: number
  error_count: number
  latency_p50: number | null
  latency_p95: number | null
  error_rate: number
  last_call_at: string | null
  last_error: string | null
}

export interface McpServerSummary {
  id: string
  display_name: string | null
  status: ConnectionStatus
  transport_type: McpTransportType
  tool_count: number
  connected_at: string | null
  stats: ServerStats
  circuit_breaker_state: CircuitState
  server_name: string | null
}

export interface ToolProfile {
  latency_ms: number
  response_shape: ResponseShape
  pagination: boolean
  error_format: string | null
  probed_at: string
}

export interface McpDiscoveredTool {
  name: string
  fqn: string
  description: string | null
  input_schema: Record<string, unknown>
  category: InferredCategory
  similar_internal: Array<[string, number]>
  profile: ToolProfile | null
}

export interface ConnectServerRequest {
  server_id: string
  display_name?: string
  transport: McpTransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface ActionResponse {
  success: boolean
  server_id: string
  message: string
}

export interface ServerDetailResponse {
  server: McpServerSummary
}

export interface ServerToolsResponse {
  server_id: string
  tools: McpDiscoveredTool[]
}

// ── Assignment types (3-tier scoping) ───────────────────────────────────

export type McpScopeType = 'global' | 'workspace' | 'project'

export type McpAssignmentState = 'enabled' | 'excluded'

/** An MCP server assignment to a scope (global, workspace, or project). */
export interface McpAssignment {
  id: string
  server_id: string
  scope_type: McpScopeType
  scope_id: string | null
  state: McpAssignmentState
  config_overrides: string | null
  created_at: string
  updated_at: string | null
}

/** One step in the resolution chain explaining why an MCP is in a given state. */
export interface ResolutionStep {
  level: McpScopeType
  /** State at this level: "enabled", "excluded", or "inherited" (no explicit assignment). */
  state: string
  scope_id: string | null
}

/** A resolved effective MCP for a given scope, after cascade resolution. */
export interface EffectiveMcp {
  server_id: string
  display_name: string
  /** Final resolved state: "enabled" or "excluded". */
  state: McpAssignmentState
  resolved_by: McpAssignment
  resolution_chain: ResolutionStep[]
}

export interface CreateAssignmentRequest {
  scope_type: McpScopeType
  scope_id?: string
  state: McpAssignmentState
  config_overrides?: Record<string, unknown>
}

export interface MigrateResponse {
  success: boolean
  migrated: number
  message: string
}

// ── API ──────────────────────────────────────────────────────────────────

export const mcpFederationApi = {
  /** List all connected MCP servers */
  listServers: () =>
    api.get<McpServerSummary[]>('/mcp-federation/servers'),

  /** Connect a new MCP server */
  connectServer: (body: ConnectServerRequest) =>
    api.post<ActionResponse>('/mcp-federation/servers', body),

  /** Get status/details for a specific server */
  getServerStatus: (serverId: string) =>
    api.get<ServerDetailResponse>(`/mcp-federation/servers/${serverId}`),

  /** Disconnect (remove) a server */
  disconnectServer: (serverId: string) =>
    api.delete<ActionResponse>(`/mcp-federation/servers/${serverId}`),

  /** List tools discovered on a server */
  listServerTools: (serverId: string) =>
    api.get<ServerToolsResponse>(`/mcp-federation/servers/${serverId}/tools`),

  /** Trigger a probe on a server (re-discover tools) */
  probeServer: (serverId: string) =>
    api.post<ActionResponse>(`/mcp-federation/servers/${serverId}/probe`),

  /** Reconnect a disconnected/errored server */
  reconnectServer: (serverId: string) =>
    api.post<ActionResponse>(`/mcp-federation/servers/${serverId}/reconnect`),

  // ── Assignment scoping (3-tier) ─────────────────────────────────────

  /** List all assignments for a specific server */
  getAssignments: (serverId: string) =>
    api.get<McpAssignment[]>(`/mcp-federation/servers/${serverId}/assignments`),

  /** Create an assignment (scope a server to global/workspace/project) */
  createAssignment: (serverId: string, body: CreateAssignmentRequest) =>
    api.post<McpAssignment>(`/mcp-federation/servers/${serverId}/assignments`, body),

  /** Delete an assignment */
  deleteAssignment: (assignmentId: string) =>
    api.delete<ActionResponse>(`/mcp-federation/assignments/${assignmentId}`),

  /** Resolve effective MCPs for a given scope */
  resolveEffectiveMcps: (params: { workspace_id?: string; project_id?: string }) => {
    const qs = new URLSearchParams()
    if (params.workspace_id) qs.set('workspace_id', params.workspace_id)
    if (params.project_id) qs.set('project_id', params.project_id)
    const query = qs.toString()
    return api.get<EffectiveMcp[]>(`/mcp-federation/resolve${query ? `?${query}` : ''}`)
  },

  /** Convenience: resolve effective MCPs for a workspace */
  getWorkspaceEffectiveMcps: (slug: string) =>
    api.get<EffectiveMcp[]>(`/workspaces/${slug}/effective-mcps`),

  /** Convenience: resolve effective MCPs for a project */
  getProjectEffectiveMcps: (slug: string) =>
    api.get<EffectiveMcp[]>(`/projects/${slug}/effective-mcps`),

  /** Run migration: auto-assign existing servers as global+enabled */
  migrateAssignments: () =>
    api.post<MigrateResponse>('/mcp-federation/migrate-assignments'),
}

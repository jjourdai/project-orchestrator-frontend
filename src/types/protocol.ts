// ============================================================================
// Protocol Engine — Shared TypeScript Interfaces
// ============================================================================

// ---------------------------------------------------------------------------
// Protocol Definitions
// ---------------------------------------------------------------------------

export type ProtocolStatus = 'draft' | 'active' | 'archived'

export interface ProtocolState {
  id: string
  name: string
  description?: string
  is_initial: boolean
  is_terminal: boolean
  /** When set, this state delegates to a sub-protocol (macro-state). */
  sub_protocol_id?: string | null
  metadata?: Record<string, unknown>
}

export interface ProtocolTransition {
  id: string
  from_state_id: string
  to_state_id: string
  event: string
  guard?: string | null
  action?: string | null
  description?: string
}

export interface Protocol {
  id: string
  name: string
  description?: string
  status?: ProtocolStatus
  /** Populated by GET /protocols/:id (ProtocolDetail), absent in list responses */
  states?: ProtocolState[]
  /** Populated by GET /protocols/:id (ProtocolDetail), absent in list responses */
  transitions?: ProtocolTransition[]
  /** Protocol category: 'system' | 'business' */
  protocol_category?: string
  /** Trigger mode: 'manual' | 'auto' | 'scheduled' | 'event' */
  trigger_mode?: string
  /** Trigger configuration (cron expression, webhook URL, event pattern, etc.) */
  trigger_config?: Record<string, unknown>
  /** ISO timestamp of the last automatic trigger */
  last_triggered_at?: string
  created_at: string
  updated_at?: string
  /** Optional — not returned by the backend currently */
  tags?: string[]
}

// ---------------------------------------------------------------------------
// Protocol Runs
// ---------------------------------------------------------------------------

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ProtocolRun {
  id: string
  protocol_id: string
  protocol_name?: string
  /** Backend field name is `current_state` (UUID) */
  current_state: string
  /** Resolved client-side or by enriched endpoints */
  current_state_name?: string
  status: RunStatus
  parent_run_id?: string | null
  plan_id?: string | null
  task_id?: string | null
  started_at: string
  completed_at?: string | null
  error?: string | null
  states_visited?: StateVisit[]
  /** How this run was triggered */
  triggered_by?: string
}

export interface StateVisit {
  state_id: string
  state_name?: string
  trigger?: string
  entered_at: string
  exited_at?: string | null
}

export interface RunStateHistory {
  state_id: string
  state_name: string
  entered_at: string
  exited_at?: string | null
  event?: string
  duration_ms?: number
}

export interface RunNode {
  id: string
  protocol_id: string
  protocol_name?: string
  current_state: string
  current_state_name?: string
  status: RunStatus
  started_at: string
  completed_at?: string | null
  states_visited?: StateVisit[]
  /** @deprecated alias kept for backward compat */
  state_history?: RunStateHistory[]
  children: RunNode[]
}

// ---------------------------------------------------------------------------
// FSM Viewer Types
// ---------------------------------------------------------------------------

export interface FsmBreadcrumb {
  protocolId: string
  protocolName: string
  /** The state in the parent protocol that triggered drill-down */
  parentStateName?: string
}

// ---------------------------------------------------------------------------
// RFC Types
// ---------------------------------------------------------------------------

export type RfcStatus = 'draft' | 'proposed' | 'accepted' | 'implemented' | 'rejected'

export interface RfcSection {
  title: string
  content: string
}

export interface Rfc {
  id: string
  title: string
  status: RfcStatus
  importance: 'low' | 'medium' | 'high' | 'critical'
  sections: RfcSection[]
  protocol_run_id?: string | null
  current_state?: string
  created_at: string
  updated_at?: string
  created_by?: string
  tags: string[]
}

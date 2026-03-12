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
  status: ProtocolStatus
  states: ProtocolState[]
  transitions: ProtocolTransition[]
  created_at: string
  updated_at?: string
  tags: string[]
}

// ---------------------------------------------------------------------------
// Protocol Runs
// ---------------------------------------------------------------------------

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ProtocolRun {
  id: string
  protocol_id: string
  protocol_name?: string
  current_state_id: string
  current_state_name?: string
  status: RunStatus
  parent_run_id?: string | null
  parent_state_id?: string | null
  started_at: string
  completed_at?: string | null
  metadata?: Record<string, unknown>
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
  protocol_name: string
  current_state_name: string
  status: RunStatus
  started_at: string
  completed_at?: string | null
  state_history: RunStateHistory[]
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

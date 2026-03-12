/**
 * Protocol API service — CRUD for protocols, runs, and FSM state machine data.
 */

import { api, buildQuery } from './api'
import type { Protocol, ProtocolRun, RunNode, RunStateHistory } from '@/types/protocol'

// ---------------------------------------------------------------------------
// List params
// ---------------------------------------------------------------------------

interface ListProtocolsParams {
  project_id: string
  category?: string
  status?: string
  limit?: number
  offset?: number
}

interface ListRunsParams {
  status?: string
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const protocolApi = {
  // --- Protocols ---

  listProtocols: (params: ListProtocolsParams) =>
    api.get<{ items: Protocol[]; total: number }>(`/protocols${buildQuery(params)}`),

  getProtocol: (protocolId: string) =>
    api.get<Protocol>(`/protocols/${protocolId}`),

  // --- Runs ---

  /** List runs for a specific protocol */
  listRuns: (protocolId: string, params: ListRunsParams = {}) =>
    api.get<{ items: ProtocolRun[]; total: number }>(
      `/protocols/${protocolId}/runs${buildQuery(params)}`,
    ),

  getRun: (runId: string) =>
    api.get<ProtocolRun>(`/protocols/runs/${runId}`),

  getRunTree: (runId: string) =>
    api.get<RunNode>(`/protocols/runs/${runId}/tree`),

  getRunHistory: (runId: string) =>
    api.get<RunStateHistory[]>(`/protocols/runs/${runId}/history`),

  getRunChildren: (runId: string) =>
    api.get<ProtocolRun[]>(`/protocols/runs/${runId}/children`),

  /** Trigger a transition event on a run */
  triggerEvent: (runId: string, event: string) =>
    api.post<ProtocolRun>(`/protocols/runs/${runId}/transition`, { event }),

  /** Cancel an active run */
  cancelRun: (runId: string) =>
    api.post<ProtocolRun>(`/protocols/runs/${runId}/cancel`, {}),

  /** Start a new run for a protocol */
  startRun: (protocolId: string, metadata?: Record<string, unknown>) =>
    api.post<ProtocolRun>(`/protocols/${protocolId}/runs`, { metadata }),
}

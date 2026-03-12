/**
 * RFC API service — CRUD for RFC documents and their lifecycle transitions.
 */

import { api, buildQuery } from './api'
import type { Rfc, RfcStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// List params
// ---------------------------------------------------------------------------

interface ListRfcsParams {
  status?: RfcStatus
  importance?: string
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const rfcApi = {
  list: (params: ListRfcsParams = {}) =>
    api.get<{ items: Rfc[]; total: number }>(`/rfcs${buildQuery(params)}`),

  get: (rfcId: string) =>
    api.get<Rfc>(`/rfcs/${rfcId}`),

  create: (data: {
    title: string
    sections: { title: string; content: string }[]
    importance?: string
    tags?: string[]
  }) => api.post<Rfc>('/rfcs', data),

  update: (rfcId: string, data: Partial<Pick<Rfc, 'title' | 'sections' | 'importance' | 'tags'>>) =>
    api.patch<Rfc>(`/rfcs/${rfcId}`, data),

  delete: (rfcId: string) =>
    api.delete(`/rfcs/${rfcId}`),

  /** Transition the RFC status (triggers protocol event under the hood) */
  transition: (rfcId: string, action: 'propose' | 'accept' | 'reject' | 'implement') =>
    api.post<Rfc>(`/rfcs/${rfcId}/transition`, { action }),
}

/**
 * Discussions service — fetches the discussion tree for a chat session.
 *
 * GET /api/chat/sessions/{sessionId}/tree -> DiscussionNode
 */

import { api } from './api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscussionNodeMetadata {
  /** Origin type: 'runner' | 'conversation' | 'root' */
  type: string
  /** Runner run_id if spawned by a runner */
  run_id?: string
  /** Task id if spawned by a runner */
  task_id?: string
}

export interface DiscussionNode {
  session_id: string
  title: string | null
  status: 'streaming' | 'completed' | 'failed' | 'idle'
  cost_usd: number
  duration_secs: number
  message_count: number
  children: DiscussionNode[]
  metadata: DiscussionNodeMetadata
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const discussionsApi = {
  /** Fetch the full discussion tree rooted at `sessionId`. */
  getTree: (sessionId: string) =>
    api.get<DiscussionNode>(`/chat/sessions/${sessionId}/tree`),
}

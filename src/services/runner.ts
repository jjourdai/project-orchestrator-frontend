/**
 * Runner service — polls the plan runner status endpoint and exposes
 * a React hook for real-time runner dashboard data.
 *
 * GET /api/plans/{id}/run/status -> RunSnapshot
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = 'spawning' | 'running' | 'verifying' | 'completed' | 'failed'

export interface ActiveAgentSnapshot {
  task_id: string
  task_title: string
  session_id: string
  elapsed_secs: number
  cost_usd: number
  status: AgentStatus
}

export interface WaveSnapshot {
  wave_index: number
  agents: ActiveAgentSnapshot[]
}

export interface RunSnapshot {
  run_id: string
  plan_id: string
  plan_title: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  current_wave: number
  total_waves: number
  waves: WaveSnapshot[]
  total_cost_usd: number
  elapsed_secs: number
  started_at: string
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const runnerApi = {
  getStatus: (planId: string) =>
    api.get<RunSnapshot>(`/plans/${planId}/run/status`),

  /**
   * Cancel an active run. The backend will gracefully stop all running agents.
   *
   * - 404 → no active run for this plan
   * - 409 → cancellation already in progress
   */
  cancelRun: async (planId: string): Promise<void> => {
    try {
      await api.post<void>(`/plans/${planId}/run/cancel`)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          throw new Error('No active run to cancel')
        }
        if (err.status === 409) {
          throw new Error('Cancellation already in progress')
        }
      }
      throw err
    }
  },
}

// ---------------------------------------------------------------------------
// Hook: useRunnerStatus
// ---------------------------------------------------------------------------

interface UseRunnerStatusResult {
  snapshot: RunSnapshot | null
  isRunning: boolean
  error: string | null
  /** Force an immediate refresh */
  refresh: () => void
}

/**
 * Polls the runner status for a given plan at a configurable interval.
 *
 * - While the run is active (status=running), polling continues.
 * - Once completed/failed/cancelled, polling stops automatically.
 * - On error, the last known snapshot is preserved and error is set.
 */
export function useRunnerStatus(
  planId: string | undefined,
  intervalMs: number = 2000,
): UseRunnerStatusResult {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const planIdRef = useRef(planId)
  planIdRef.current = planId

  const fetchStatus = useCallback(async () => {
    const id = planIdRef.current
    if (!id) return

    try {
      const data = await runnerApi.getStatus(id)
      // Only update if we're still looking at the same plan
      if (planIdRef.current === id) {
        setSnapshot(data)
        setError(null)

        // Stop polling when the run is no longer active
        if (data.status !== 'running' && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    } catch (err) {
      if (planIdRef.current === id) {
        setError(err instanceof Error ? err.message : 'Failed to fetch runner status')
      }
    }
  }, [])

  // Start / restart polling when planId changes
  useEffect(() => {
    if (!planId) {
      setSnapshot(null)
      setError(null)
      return
    }

    // Fetch immediately
    fetchStatus()

    // Set up polling
    timerRef.current = setInterval(fetchStatus, intervalMs)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [planId, intervalMs, fetchStatus])

  const isRunning = snapshot?.status === 'running'

  return { snapshot, isRunning, error, refresh: fetchStatus }
}

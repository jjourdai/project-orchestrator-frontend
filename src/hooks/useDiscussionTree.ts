/**
 * useDiscussionTree — fetches and polls the discussion tree for a session.
 *
 * Returns the tree structure, loading state, error, and a manual refresh fn.
 * Auto-polls while any node in the tree has status 'streaming'.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { discussionsApi, type DiscussionNode } from '@/services/discussions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively check if any node in the tree is actively streaming. */
function hasStreamingNode(node: DiscussionNode): boolean {
  if (node.status === 'streaming') return true
  return node.children.some(hasStreamingNode)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseDiscussionTreeResult {
  tree: DiscussionNode | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useDiscussionTree(
  sessionId: string | undefined,
  pollIntervalMs: number = 3000,
): UseDiscussionTreeResult {
  const [tree, setTree] = useState<DiscussionNode | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const fetchTree = useCallback(async () => {
    const sid = sessionIdRef.current
    if (!sid) return

    try {
      setIsLoading((prev) => (tree === null ? true : prev))
      const data = await discussionsApi.getTree(sid)
      if (sessionIdRef.current === sid) {
        setTree(data)
        setError(null)

        // Stop polling when nothing is streaming
        if (!hasStreamingNode(data) && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    } catch (err) {
      if (sessionIdRef.current === sid) {
        setError(err instanceof Error ? err.message : 'Failed to fetch discussion tree')
      }
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sessionId) {
      setTree(null)
      setError(null)
      return
    }

    fetchTree()
    timerRef.current = setInterval(fetchTree, pollIntervalMs)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [sessionId, pollIntervalMs, fetchTree])

  return { tree, isLoading, error, refresh: fetchTree }
}

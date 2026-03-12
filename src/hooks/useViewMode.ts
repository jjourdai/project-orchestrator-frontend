import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

type ViewMode = 'list' | 'kanban'

const STORAGE_KEY = 'preferred-view-mode'
const DEFAULT_MODE: ViewMode = 'kanban'

function getStoredMode(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'list' || stored === 'kanban') return stored
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_MODE
}

export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [searchParams, setSearchParams] = useSearchParams()

  const urlMode = searchParams.get('view') as ViewMode | null
  const viewMode: ViewMode = urlMode === 'list' || urlMode === 'kanban' ? urlMode : getStoredMode()

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      try {
        localStorage.setItem(STORAGE_KEY, mode)
      } catch {
        // localStorage unavailable
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('view')
        return next
      }, { replace: true })
    },
    [setSearchParams],
  )

  return [viewMode, setViewMode]
}

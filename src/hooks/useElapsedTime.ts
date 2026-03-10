import { useState, useEffect, useRef } from 'react'

/**
 * Returns a formatted elapsed-time string that updates every second while running.
 * When not running, returns the static `finalDurationSecs` formatted.
 *
 * @param startedAt  ISO 8601 timestamp of the start
 * @param isRunning  Whether the timer should tick
 * @param finalDurationSecs  Final duration (used when not running)
 */
export function useElapsedTime(
  startedAt: string,
  isRunning: boolean,
  finalDurationSecs?: number,
): string {
  const [elapsed, setElapsed] = useState<number>(() => {
    if (!isRunning && finalDurationSecs != null) return finalDurationSecs
    return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isRunning) {
      if (finalDurationSecs != null) setElapsed(finalDurationSecs)
      return
    }

    const startTime = new Date(startedAt).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)))
    tick()

    intervalRef.current = setInterval(tick, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [startedAt, isRunning, finalDurationSecs])

  return formatElapsedSecs(elapsed)
}

function formatElapsedSecs(secs: number): string {
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const s = secs % 60
  if (mins < 60) return `${mins}m ${String(s).padStart(2, '0')}s`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

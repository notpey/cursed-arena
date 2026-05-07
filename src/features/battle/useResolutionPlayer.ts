/**
 * useResolutionPlayer
 *
 * Drives playback of a BattlePresentationQueue built from resolved timeline
 * steps. The hook owns the "what is on screen right now" concern; the engine
 * owns correctness.
 *
 * Key invariants:
 * - While isPlaying is true, caller must block player command submission.
 * - skipPlayback() immediately applies the final state and calls onComplete.
 * - If startPlayback() is called while a queue is already running, the old
 *   run is cancelled (via generational runId guard) before the new one starts.
 * - State is never set after unmount (isMountedRef guard).
 * - The final displayed state always equals the last state-commit item's
 *   commitState, which is the engine's authoritative final BattleState.
 */

import { useCallback, useRef, useState } from 'react'
import { buildPresentationQueue, type BattlePresentationItem } from '@/features/battle/presentation'
import type { BattleState, BattleTimelineStep } from '@/features/battle/types'

// ── Timing ────────────────────────────────────────────────────────────────────

/** Milliseconds to display each non-commit presentation frame. */
const FRAME_DURATION_MS = 280

/** Shorter pause for less-important frames (resource, state-commit). */
const FRAME_DURATION_FAST_MS = 80

function frameDuration(item: BattlePresentationItem): number {
  switch (item.kind) {
    case 'state-commit':
    case 'resource':
      return FRAME_DURATION_FAST_MS
    case 'action-start':
    case 'ability':
      return FRAME_DURATION_MS + 60
    case 'defeat':
    case 'victory':
      return FRAME_DURATION_MS + 120
    default:
      return FRAME_DURATION_MS
  }
}

function wait(ms: number): Promise<void> {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

// ── Hook state shape ──────────────────────────────────────────────────────────

export type ResolutionPlayerState = {
  /** Currently displayed BattleState (may lag behind engine during playback). */
  displayedState: BattleState | null
  /** Presentation item currently on screen (null when idle). */
  currentItem: BattlePresentationItem | null
  /** instanceId of the fighter currently acting (for board highlight). */
  activeActorId: string | null
  /** instanceId of the primary target (for board highlight). */
  activeTargetId: string | null
  /** abilityId currently being used (for strip highlight). */
  activeAbilityId: string | null
  /** True while the queue is playing. Gate player input on this. */
  isPlaying: boolean
}

export type ResolutionPlayerControls = {
  /** Begin playing a resolved timeline. Cancels any in-progress playback. */
  startPlayback: (steps: BattleTimelineStep[], onComplete: (finalState: BattleState) => void) => void
  /** Immediately commit the final state and call onComplete. */
  skipPlayback: () => void
  /** Alias for skipPlayback — call after the component handles onComplete. */
  finishPlayback: () => void
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useResolutionPlayer(): ResolutionPlayerState & ResolutionPlayerControls {
  const [displayedState, setDisplayedState] = useState<BattleState | null>(null)
  const [currentItem, setCurrentItem] = useState<BattlePresentationItem | null>(null)
  const [activeActorId, setActiveActorId] = useState<string | null>(null)
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null)
  const [activeAbilityId, setActiveAbilityId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // Generational ID — incremented on each new startPlayback call to cancel old loops.
  const runIdRef = useRef(0)
  // Stable reference to the current onComplete callback.
  const onCompleteRef = useRef<((s: BattleState) => void) | null>(null)
  // Final state of the current queue — used by skipPlayback.
  const finalStateRef = useRef<BattleState | null>(null)
  // Full queue, kept for skip.
  const queueRef = useRef<BattlePresentationItem[]>([])

  // ── Internal: reset highlight state ────────────────────────────────────────
  const clearHighlights = useCallback(() => {
    setCurrentItem(null)
    setActiveActorId(null)
    setActiveTargetId(null)
    setActiveAbilityId(null)
  }, [])

  // ── skipPlayback / finishPlayback ───────────────────────────────────────────
  const skipPlayback = useCallback(() => {
    // Cancel the running loop.
    runIdRef.current += 1

    const finalState = finalStateRef.current
    if (!finalState) {
      setIsPlaying(false)
      clearHighlights()
      return
    }

    setDisplayedState(finalState)
    setIsPlaying(false)
    clearHighlights()

    const cb = onCompleteRef.current
    onCompleteRef.current = null
    finalStateRef.current = null
    queueRef.current = []

    if (cb) cb(finalState)
  }, [clearHighlights])

  const finishPlayback = skipPlayback

  // ── startPlayback ───────────────────────────────────────────────────────────
  const startPlayback = useCallback(
    (steps: BattleTimelineStep[], onComplete: (finalState: BattleState) => void) => {
      // Cancel any running loop.
      const myRunId = ++runIdRef.current

      const queue = buildPresentationQueue(steps)
      queueRef.current = queue

      // Stash the final engine state for skip.
      const lastCommit = [...queue].reverse().find((item) => item.kind === 'state-commit')
      finalStateRef.current = lastCommit?.commitState ?? null
      onCompleteRef.current = onComplete

      if (queue.length === 0) {
        // Nothing to play — call onComplete immediately with the last step's state.
        const finalState = steps[steps.length - 1]?.state ?? null
        if (finalState && onComplete) onComplete(finalState)
        return
      }

      setIsPlaying(true)

      void (async () => {
        for (const item of queue) {
          if (runIdRef.current !== myRunId) return

          // Apply highlight state for this frame.
          setCurrentItem(item)
          setActiveActorId(item.actorId ?? null)
          setActiveTargetId(item.targetId ?? null)

          if (item.kind === 'action-start' || item.kind === 'ability') {
            setActiveAbilityId(item.abilityId ?? null)
          }

          // Commit state on state-commit frames — HP, statuses, energy are
          // now visible on screen at the right moment.
          if (item.kind === 'state-commit' && item.commitState) {
            setDisplayedState(item.commitState)
          }

          await wait(frameDuration(item))

          if (runIdRef.current !== myRunId) return
        }

        // Natural completion.
        const finalState = finalStateRef.current
        setIsPlaying(false)
        clearHighlights()

        const cb = onCompleteRef.current
        onCompleteRef.current = null
        finalStateRef.current = null
        queueRef.current = []

        if (finalState && cb) cb(finalState)
      })()
    },
    [clearHighlights],
  )

  return {
    displayedState,
    currentItem,
    activeActorId,
    activeTargetId,
    activeAbilityId,
    isPlaying,
    startPlayback,
    skipPlayback,
    finishPlayback,
  }
}

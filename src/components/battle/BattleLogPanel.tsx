import { cn } from '@/components/battle/battleDisplay'
import type { BattleEvent, BattleEventKind } from '@/features/battle/types'

function toneClasses(tone: BattleEvent['tone']) {
  if (tone === 'red') return 'border-ca-red/26 bg-ca-red-wash'
  if (tone === 'teal') return 'border-ca-teal/26 bg-ca-teal-wash'
  if (tone === 'gold') return 'border-amber-300/28 bg-amber-300/10'
  return 'border-white/10 bg-[rgba(255,255,255,0.038)]'
}

/**
 * Single-character glyph per event kind. Rendered in a tiny rounded badge
 * to give each entry a fast scan-cue without visual noise.
 */
function kindGlyph(kind: BattleEventKind): { icon: string; tone: string } {
  switch (kind) {
    case 'damage':  return { icon: '⚔', tone: 'text-ca-red bg-ca-red/15 border-ca-red/30' }
    case 'heal':    return { icon: '✚', tone: 'text-emerald-300 bg-emerald-400/12 border-emerald-400/30' }
    case 'status':  return { icon: '✦', tone: 'text-amber-300 bg-amber-300/12 border-amber-300/30' }
    case 'defeat':  return { icon: '☠', tone: 'text-ca-red bg-ca-red/20 border-ca-red/35' }
    case 'victory': return { icon: '★', tone: 'text-amber-300 bg-amber-300/18 border-amber-300/35' }
    case 'phase':   return { icon: '◇', tone: 'text-sky-300 bg-sky-400/10 border-sky-400/30' }
    case 'action':  return { icon: '▸', tone: 'text-ca-teal bg-ca-teal/12 border-ca-teal/30' }
    case 'system':
    default:        return { icon: '·', tone: 'text-ca-text-3 bg-white/6 border-white/12' }
  }
}

export function BattleLogPanel({
  events,
  title = 'Quick Battle',
}: {
  events: BattleEvent[]
  title?: string
}) {
  const displayEvents = [...events].reverse()
  const latestRound = displayEvents[0]?.round ?? 1

  return (
    <aside className="flex min-h-0 flex-col rounded-[0.3rem] border border-white/13 bg-[linear-gradient(180deg,rgba(24,22,32,0.96),rgba(7,7,11,0.97))] p-3 shadow-[0_18px_38px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div>
          <p className="ca-mono-label text-[0.65rem] text-ca-text-2">COMBAT LOG</p>
          <p className="ca-display mt-1 text-[1rem] leading-none text-ca-text">{title.toUpperCase()}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="ca-mono-label rounded-full border border-white/14 bg-white/7 px-2 py-1 text-[0.6rem] text-ca-text-2">
            ROUND {latestRound}
          </span>
          <span className="ca-mono-label rounded-full border border-white/14 bg-white/7 px-2 py-1 text-[0.6rem] text-ca-text-2">
            {events.length} ENTRIES
          </span>
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {displayEvents.length > 0 ? (
          displayEvents.map((event, i) => {
            // Round divider: shown ABOVE the first entry of each round (in
            // reverse-chronological display order, that is whenever the next
            // older entry has a different round).
            const olderEvent = displayEvents[i + 1]
            const showDivider = !olderEvent || olderEvent.round !== event.round
            const glyph = kindGlyph(event.kind)
            return (
              <div key={event.id}>
                <div
                  className={cn('rounded-[0.3rem] border px-2.5 py-2 animate-ca-slide-up', toneClasses(event.tone))}
                  style={{ animationDelay: `${Math.min(i, 4) * 18}ms` }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-grid h-[0.95rem] w-[0.95rem] place-items-center rounded-[0.18rem] border text-[0.55rem] leading-none',
                          glyph.tone,
                        )}
                        aria-hidden
                      >
                        {glyph.icon}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 ca-mono-label text-[0.6rem] text-ca-text-2">
                        {event.kind.toUpperCase()}
                      </span>
                    </div>
                    {event.amount != null ? <span className="ca-mono-label text-[0.6rem] text-ca-text-2">{event.amount}</span> : null}
                  </div>
                  <p className="mt-1.5 text-[0.75rem] leading-5 text-ca-text-2">{event.message}</p>
                </div>
                {showDivider && i < displayEvents.length - 1 ? (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
                    <span className="ca-mono-label text-[0.5rem] tracking-[0.14em] text-ca-text-3">ROUND {olderEvent?.round ?? event.round - 1}</span>
                    <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
                  </div>
                ) : null}
              </div>
            )
          })
        ) : (
          <div className="rounded-[0.3rem] border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] px-3 py-4">
            <p className="text-[0.75rem] leading-5 text-ca-text-3">Resolve a round to populate the combat log.</p>
          </div>
        )}
      </div>
    </aside>
  )
}

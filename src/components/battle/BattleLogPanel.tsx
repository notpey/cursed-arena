import { cn } from '@/components/battle/battleDisplay'
import type { BattleEvent } from '@/features/battle/types'

function toneClasses(tone: BattleEvent['tone']) {
  if (tone === 'red') return 'border-ca-red/20 bg-ca-red-wash'
  if (tone === 'teal') return 'border-ca-teal/20 bg-ca-teal-wash'
  if (tone === 'gold') return 'border-amber-300/25 bg-amber-300/10'
  return 'border-white/8 bg-[rgba(255,255,255,0.03)]'
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
    <aside className="flex min-h-0 flex-col rounded-[0.3rem] border border-white/10 bg-[linear-gradient(180deg,rgba(30,28,36,0.96),rgba(13,12,17,0.98))] p-3 shadow-[0_20px_40px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-2">
        <div>
          <p className="ca-mono-label text-[0.65rem] text-ca-text-3">COMBAT LOG</p>
          <p className="ca-display mt-1 text-[1rem] leading-none text-ca-text">{title.toUpperCase()}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="ca-mono-label rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.6rem] text-ca-text-3">
            ROUND {latestRound}
          </span>
          <span className="ca-mono-label rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.6rem] text-ca-text-3">
            {events.length} ENTRIES
          </span>
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {displayEvents.length > 0 ? (
          displayEvents.map((event, i) => (
            <div
              key={event.id}
              className={cn('rounded-[0.3rem] border px-2.5 py-2 animate-ca-slide-up', toneClasses(event.tone))}
              style={{ animationDelay: `${Math.min(i, 4) * 18}ms` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="ca-mono-label text-[0.6rem] text-ca-text-3">R{event.round}</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 ca-mono-label text-[0.6rem] text-ca-text-2">
                    {event.kind.toUpperCase()}
                  </span>
                </div>
                {event.amount != null ? <span className="ca-mono-label text-[0.6rem] text-ca-text-2">{event.amount}</span> : null}
              </div>
              <p className="mt-1.5 text-[0.75rem] leading-5 text-ca-text-2">{event.message}</p>
            </div>
          ))
        ) : (
          <div className="rounded-[0.3rem] border border-dashed border-white/10 bg-[rgba(255,255,255,0.02)] px-3 py-4">
            <p className="text-[0.75rem] leading-5 text-ca-text-3">Resolve a round to populate the combat log.</p>
          </div>
        )}
      </div>
    </aside>
  )
}

export type LadderTab = 'sorcerer' | 'clan'

export function LadderTabs({ value, onChange }: { value: LadderTab; onChange: (value: LadderTab) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-white/10 bg-black/20">
      {[
        ['sorcerer', 'Sorcerer Ladder'],
        ['clan', 'Clan Ladder'],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key as LadderTab)}
          className={`ca-display border-r border-white/8 px-4 py-3 text-xl transition last:border-r-0 ${value === key ? 'bg-ca-red text-white' : 'text-ca-text-2 hover:bg-white/[0.04]'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

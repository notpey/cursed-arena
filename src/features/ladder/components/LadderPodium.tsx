import { SquareAvatar } from '@/components/ui/SquareAvatar'
import type { ClanLadderEntry, SorcererLadderEntry } from '@/features/ladder/types'

type PodiumEntry = SorcererLadderEntry | ClanLadderEntry

export function LadderPodium({ entries, type }: { entries: PodiumEntry[]; type: 'sorcerer' | 'clan' }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {entries.slice(0, 3).map((entry) => {
        const rank = entry.ladderRank ?? 0
        const isTop = rank === 1
        const name = type === 'sorcerer' ? (entry as SorcererLadderEntry).displayName : (entry as ClanLadderEntry).clanName
        const tag = type === 'sorcerer' ? (entry as SorcererLadderEntry).clanTag : (entry as ClanLadderEntry).clanTag
        const avatar = type === 'sorcerer' ? (entry as SorcererLadderEntry).avatarUrl : (entry as ClanLadderEntry).clanAvatarUrl
        const score = type === 'sorcerer' ? `${(entry as SorcererLadderEntry).experience.toLocaleString()} EXP` : `${(entry as ClanLadderEntry).clanScore.toLocaleString()} Clan Score`
        const meta = type === 'sorcerer'
          ? `Level ${(entry as SorcererLadderEntry).level} / ${(entry as SorcererLadderEntry).rankTitle}`
          : `${(entry as ClanLadderEntry).memberCount} members / Top: ${(entry as ClanLadderEntry).topSorcerer?.displayName ?? 'None'}`
        return (
          <article key={`${type}-${rank}-${name}`} className={`ca-card p-4 ${isTop ? 'border-ca-gold/30 shadow-[0_0_30px_rgba(245,166,35,0.12)] lg:-mt-2' : ''}`}>
            <div className="flex items-center gap-4">
              <SquareAvatar src={avatar} alt={name} fallbackLabel={tag ?? name} />
              <div className="min-w-0">
                <p className={`ca-display text-4xl ${isTop ? 'text-ca-gold' : 'text-ca-text'}`}>#{rank}</p>
                <h3 className="ca-display mt-1 truncate text-3xl text-ca-text">{name}</h3>
                {tag ? <p className="ca-mono-label mt-1 text-[0.46rem] text-ca-teal">[{tag}]</p> : null}
                <p className="mt-2 text-sm text-ca-text-2">{meta}</p>
                <p className="ca-mono-label mt-2 text-[0.48rem] text-ca-gold">{score}</p>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

import { EnergyPip } from '@/components/battle/BattleEnergy'
import { battleEnergyMeta, battleEnergyOrder, getEnergyCount, totalEnergyInPool, type BattleEnergyPool, type BattleEnergyType } from '@/features/battle/energy'
import type { BattleUserProfile } from '@/features/battle/types'
import { cn, getAccentStyles } from '@/components/battle/battleDisplay'

function ProfileBlock({
  profile,
  mirrored = false,
}: {
  profile: BattleUserProfile
  mirrored?: boolean
}) {
  const accent = getAccentStyles(profile.accent)

  return (
    <div className={cn('flex items-center gap-2.5', mirrored && 'flex-row-reverse text-right')}>
      <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[0.25rem] border-2 text-[0.82rem] font-black tracking-[0.08em]', accent.border, accent.wash, accent.text)}>
        {profile.initials}
      </div>
      <div className="min-w-0">
        <p className={cn('ca-display truncate text-[1rem] leading-none', accent.text)}>{profile.username.toUpperCase()}</p>
        <p className="mt-0.5 ca-mono-label truncate text-[0.6rem] text-ca-text-2">{profile.title.toUpperCase()}</p>
      </div>
    </div>
  )
}

export function BattleTopBar({
  playerProfile,
  enemyProfile,
  playerEnergy,
  boardPrompt,
  turnSecondsLeft,
  commitReady,
  battleFinished,
  onReady,
  onSelectFocus,
}: {
  playerProfile: BattleUserProfile
  enemyProfile: BattleUserProfile
  playerEnergy: BattleEnergyPool
  boardPrompt: string
  turnSecondsLeft: number
  commitReady: boolean
  battleFinished: boolean
  onReady: () => void
  onSelectFocus: (type: BattleEnergyType) => void
}) {
  const timerPercent = Math.max(0, Math.min(100, (turnSecondsLeft / 30) * 100))
  const timerUrgent = turnSecondsLeft <= 10 && turnSecondsLeft > 0

  return (
    <header className="flex items-center gap-4 border-b border-white/8 bg-[linear-gradient(180deg,rgba(12,10,22,0.92),rgba(16,13,28,0.88))] px-4 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
      <div className="w-[13rem] shrink-0">
        <ProfileBlock profile={playerProfile} />
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          {battleEnergyOrder.map((type) => {
            const meta = battleEnergyMeta[type]
            const active = playerEnergy.focus === type
            const count = getEnergyCount(playerEnergy, type)
            return (
              <button
                key={type}
                type="button"
                disabled={battleFinished}
                onClick={() => onSelectFocus(type)}
                className={cn(
                  'flex items-center gap-1 rounded-[0.2rem] border px-1.5 py-1 transition',
                  active ? 'border-white/20 bg-white/10' : 'border-transparent bg-transparent',
                  battleFinished ? 'cursor-default opacity-70' : 'hover:border-white/12 hover:bg-white/8',
                )}
                title={`${meta.label} reserve`}
              >
                <EnergyPip type={type} small />
                <span className="ca-mono-label text-[0.6rem] text-ca-text">x{count}</span>
              </button>
            )
          })}
          <span className="ca-mono-label text-[0.6rem] text-ca-text-2">T x{totalEnergyInPool(playerEnergy)}</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onReady}
            disabled={!commitReady || battleFinished}
            className={cn(
              'block w-[16rem] border px-4 py-2 ca-display text-[0.95rem] leading-none transition',
              commitReady && !battleFinished
                ? 'border-white/28 bg-[linear-gradient(180deg,rgba(248,248,252,0.95),rgba(223,224,232,0.88))] text-black hover:brightness-105'
                : 'border-white/14 bg-[rgba(255,255,255,0.06)] text-ca-text-2',
            )}
          >
            PRESS WHEN READY
          </button>

          <div className="w-[16rem] overflow-hidden rounded-full bg-[rgba(0,0,0,0.35)]">
            <div
              className={cn(
                'h-1.5 transition-all duration-1000',
                timerUrgent
                  ? 'animate-pulse bg-[linear-gradient(90deg,rgba(250,39,66,1),rgba(255,100,120,1))]'
                  : 'bg-[linear-gradient(90deg,rgba(250,39,66,0.96),rgba(255,180,190,0.92))]',
              )}
              style={{ width: `${timerPercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="ca-mono-label text-[0.65rem] text-ca-text-2">{boardPrompt.toUpperCase()}</span>
          <span className={cn('ca-mono-label text-[0.7rem] tabular-nums', timerUrgent ? 'animate-pulse text-ca-red' : 'text-ca-text')}>
            {String(turnSecondsLeft).padStart(2, '0')}S
          </span>
        </div>
      </div>

      <div className="w-[13rem] shrink-0">
        <ProfileBlock profile={enemyProfile} mirrored />
      </div>
    </header>
  )
}

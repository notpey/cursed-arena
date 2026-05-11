import { EnergyPip } from '@/components/battle/BattleEnergy'
import { battleEnergyExchangeCost, battleEnergyMeta, battleEnergyOrder, canExchangeEnergy, getEnergyCount, totalEnergyInPool, type BattleEnergyPool, type BattleEnergyType } from '@/features/battle/energy'
import type { BattleUserProfile } from '@/features/battle/types'
import { cn } from '@/components/battle/battleDisplay'
import { PlayerIdentityBadge } from '@/features/battle/components/PlayerIdentityBadge'

function ProfileBlock({
  profile,
  mirrored = false,
}: {
  profile: BattleUserProfile
  mirrored?: boolean
}) {
  return (
    <PlayerIdentityBadge
      avatarUrl={profile.avatarUrl}
      displayName={profile.username}
      clanTag={profile.clanTag}
      level={profile.level}
      rankTitle={profile.rankTitle ?? profile.title}
      ladderRank={profile.ladderRank}
      side={mirrored ? 'opponent' : 'player'}
      compact
    />
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
  onExchangeEnergy,
}: {
  playerProfile: BattleUserProfile
  enemyProfile: BattleUserProfile
  playerEnergy: BattleEnergyPool
  boardPrompt: string
  turnSecondsLeft: number
  commitReady: boolean
  battleFinished: boolean
  onReady: () => void
  onExchangeEnergy: (type: BattleEnergyType) => void
}) {
  const timerPercent = Math.max(0, Math.min(100, (turnSecondsLeft / 60) * 100))
  const timerUrgent = turnSecondsLeft <= 10 && turnSecondsLeft > 0
  const exchangeReady = canExchangeEnergy(playerEnergy)

  return (
    <header className="flex items-center gap-3 border-b border-white/13 bg-[radial-gradient(circle_at_50%_0%,rgba(6,220,194,0.04),transparent_42%),linear-gradient(180deg,rgba(18,15,28,0.96),rgba(6,6,12,0.94))] px-3 py-2 shadow-[0_3px_14px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.05)] lg:gap-4 lg:px-4">
      <div className="w-[13.5rem] shrink-0 lg:w-[17rem]">
        <ProfileBlock profile={playerProfile} />
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          {battleEnergyOrder.map((type) => {
            const meta = battleEnergyMeta[type]
            const count = getEnergyCount(playerEnergy, type)
            return (
              <button
                key={type}
                type="button"
                disabled={battleFinished || !exchangeReady}
                onClick={() => onExchangeEnergy(type)}
                className={cn(
                  'flex items-center gap-1 rounded-[0.14rem] border px-1.5 py-1 transition-all duration-150',
                  exchangeReady ? 'hover:-translate-y-[1px] hover:brightness-110 active:scale-95' : '',
                  battleFinished ? 'cursor-default opacity-70' : !exchangeReady ? 'cursor-not-allowed opacity-60' : undefined,
                )}
                style={exchangeReady ? {
                  borderColor: meta.border,
                  background: `linear-gradient(180deg, ${meta.glow}, rgba(255,255,255,0.052))`,
                } : { borderColor: 'transparent', background: 'transparent' }}
                title={exchangeReady ? `Exchange ${battleEnergyExchangeCost} Energy into 1 ${meta.label}` : `${meta.label} reserve`}
              >
                <EnergyPip type={type} small />
                <span className="ca-mono-label text-[0.6rem] text-ca-text">x{count}</span>
              </button>
            )
          })}
          <span className="ca-mono-label text-[0.6rem] text-ca-text-2">T x{totalEnergyInPool(playerEnergy)}</span>
          <span className={cn('ca-mono-label text-[0.6rem]', exchangeReady ? 'text-ca-teal' : 'text-ca-text-3')}>
            {exchangeReady ? `EXCHANGE ${battleEnergyExchangeCost}->1` : `EXCHANGE ${battleEnergyExchangeCost}`}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onReady}
            disabled={!commitReady || battleFinished}
            className={cn(
              'block w-[16rem] border px-4 py-2 ca-display text-[0.95rem] leading-none transition duration-150',
              commitReady && !battleFinished
                ? 'border-white/28 bg-[linear-gradient(180deg,rgba(248,248,252,0.96),rgba(220,222,232,0.9))] text-black shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_10px_18px_rgba(0,0,0,0.22)] hover:brightness-105 active:scale-[0.98]'
                : 'border-white/14 bg-[rgba(255,255,255,0.06)] text-ca-text-2',
            )}
          >
            PRESS WHEN READY
          </button>

          <div className={cn(
            'w-[16rem] overflow-hidden rounded-full bg-[rgba(0,0,0,0.35)] transition-shadow duration-300',
            timerUrgent && 'shadow-[0_0_13px_rgba(252,43,71,0.58)] animate-ca-urgency',
          )}>
            <div
              className={cn(
                'h-1.5 transition-[width] duration-1000',
                timerUrgent
                  ? 'bg-[linear-gradient(90deg,rgba(252,43,71,0.98),rgba(255,84,106,0.98))] shadow-[0_0_8px_rgba(252,43,71,0.64)]'
                  : 'bg-[linear-gradient(90deg,rgba(252,43,71,0.94),rgba(255,170,184,0.88))]',
              )}
              style={{ width: `${timerPercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="ca-mono-label text-[0.65rem] text-ca-text-2">{boardPrompt.toUpperCase()}</span>
          <span className={cn('ca-mono-label text-[0.7rem] tabular-nums transition-colors duration-300', timerUrgent ? 'animate-ca-urgency text-ca-red' : 'text-ca-text')}>
            {String(turnSecondsLeft).padStart(2, '0')}S
          </span>
        </div>
      </div>

      <div className="w-[13.5rem] shrink-0 lg:w-[17rem]">
        <ProfileBlock profile={enemyProfile} mirrored />
      </div>
    </header>
  )
}

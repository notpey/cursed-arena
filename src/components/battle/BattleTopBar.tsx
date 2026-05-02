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
    <header className="flex items-center gap-3 border-b border-white/10 bg-[linear-gradient(180deg,rgba(16,14,25,0.96),rgba(10,9,18,0.92))] px-3 py-2 shadow-[0_2px_10px_rgba(0,0,0,0.38)] lg:gap-4 lg:px-4">
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
                  'flex items-center gap-1 rounded-[0.14rem] border px-1.5 py-1 transition duration-150',
                  exchangeReady ? 'border-white/10 bg-[rgba(255,255,255,0.06)] hover:border-white/20 hover:bg-white/10 active:scale-95' : 'border-transparent bg-transparent',
                  battleFinished ? 'cursor-default opacity-70' : !exchangeReady ? 'cursor-not-allowed opacity-60' : undefined,
                )}
                title={exchangeReady ? `Exchange ${battleEnergyExchangeCost} chakra into 1 ${meta.label}` : `${meta.label} reserve`}
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

          <div className="w-[16rem] overflow-hidden rounded-full bg-[rgba(0,0,0,0.35)]">
            <div
              className={cn(
                'h-1.5 transition-[width] duration-1000',
                timerUrgent
                  ? 'bg-[linear-gradient(90deg,rgba(250,39,66,1),rgba(255,80,100,1))] shadow-[0_0_8px_rgba(250,39,66,0.7)]'
                  : 'bg-[linear-gradient(90deg,rgba(250,39,66,0.96),rgba(255,180,190,0.92))]',
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

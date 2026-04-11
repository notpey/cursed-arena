import { useEffect, useState } from 'react'
import gojoRender from '@/assets/renders/Satoru_Gojo_Cursed_Clash.webp'
import sukunaHome from '@/assets/renders/sukuna-home.webp'
import yujiRender from '@/assets/renders/Yuji_Itadori_Cursed_Clash.webp'
import megumiRender from '@/assets/renders/Megumi_Fushiguro_Cursed_Clash.webp'
import nobaraRender from '@/assets/renders/Nobara_Kugisaki_Cursed_Clash.webp'
import jogoRender from '@/assets/renders/Jogo_Cursed_Clash.webp'
import mahitoRender from '@/assets/renders/Mahito_Cursed_Clash.webp'
import yutaRender from '@/assets/renders/Yuta_Okkotsu_Cursed_Clash.webp'

type BannerId = 'limited-gojo' | 'limited-sukuna' | 'standard'

type FeaturedPortrait = {
  name: string
  image: string
  frame?: {
    scale?: number
    x?: string
    y?: string
  }
}

type SummonBanner = {
  id: BannerId
  navLabel: string
  bannerType: 'LIMITED BANNER' | 'STANDARD BANNER'
  title: string
  subtitle: string
  wordmark: string
  heroRender: string
  heroFrame: {
    scale: number
    maxWidth: string
    x: string
    y: string
    anchorX: string
    anchorTop: string
    wallpaperX?: string
    wallpaperY?: string
  }
  atmosphere: {
    tealGlowOpacity: number
    tealGlowSize: string
    accentGlow: string
    particleTint: string
    panelTint: string
  }
  featured: FeaturedPortrait[]
  ssrRateText: string
  pityCurrent: number
  pityCap: number
  pityTrackMax: number
  endsIn: string
  costs: {
    single: number
    ten: number
  }
}

const summonBanners: SummonBanner[] = [
  {
    id: 'limited-gojo',
    navLabel: 'LIMITED: GOJO',
    bannerType: 'LIMITED BANNER',
    title: 'GOJO SATORU',
    subtitle: 'Limitless � Six Eyes',
    wordmark: 'GOJO',
    heroRender: gojoRender,
    heroFrame: {
      scale: 1.28,
      maxWidth: '38rem',
      x: '4%',
      y: '2%',
      anchorX: '58%',
      anchorTop: '8%',
      wallpaperX: '8%',
      wallpaperY: '-34%',
    },
    atmosphere: {
      tealGlowOpacity: 0.12,
      tealGlowSize: '44rem',
      accentGlow: 'rgba(228,230,239,0.16)',
      particleTint: 'rgba(5,216,189,0.14)',
      panelTint: 'rgba(5,216,189,0.04)',
    },
    featured: [
      { name: 'Gojo', image: gojoRender, frame: { scale: 1.8, y: '10%' } },
      { name: 'Yuta', image: yutaRender, frame: { scale: 1.7, y: '10%' } },
      { name: 'Megumi', image: megumiRender, frame: { scale: 1.7, y: '10%' } },
    ],
    ssrRateText: 'SSR Rate: 0.6% � Pity: 67/90',
    pityCurrent: 67,
    pityCap: 90,
    pityTrackMax: 180,
    endsIn: '4D 12H 33M',
    costs: { single: 300, ten: 3000 },
  },
  {
    id: 'limited-sukuna',
    navLabel: 'LIMITED: SUKUNA',
    bannerType: 'LIMITED BANNER',
    title: 'RYOMEN SUKUNA',
    subtitle: 'Malevolent Shrine � Cleave / Dismantle',
    wordmark: 'SUKUNA',
    heroRender: sukunaHome,
    heroFrame: {
      scale: 1.02,
      maxWidth: '35rem',
      x: '3%',
      y: '0%',
      anchorX: '58%',
      anchorTop: '6%',
      wallpaperX: '4%',
      wallpaperY: '-30%',
    },
    atmosphere: {
      tealGlowOpacity: 0.1,
      tealGlowSize: '42rem',
      accentGlow: 'rgba(250,39,66,0.22)',
      particleTint: 'rgba(5,216,189,0.12)',
      panelTint: 'rgba(5,216,189,0.05)',
    },
    featured: [
      { name: 'Sukuna', image: sukunaHome, frame: { scale: 1.35, y: '10%' } },
      { name: 'Jogo', image: jogoRender, frame: { scale: 1.72, y: '12%' } },
      { name: 'Mahito', image: mahitoRender, frame: { scale: 1.68, y: '12%' } },
    ],
    ssrRateText: 'SSR Rate: 0.6% � Pity: 12/90',
    pityCurrent: 12,
    pityCap: 90,
    pityTrackMax: 180,
    endsIn: '9D 03H 08M',
    costs: { single: 300, ten: 3000 },
  },
  {
    id: 'standard',
    navLabel: 'STANDARD',
    bannerType: 'STANDARD BANNER',
    title: 'CURSED ARCHIVE',
    subtitle: 'Open Pool � Core Sorcerers',
    wordmark: 'ARCHIVE',
    heroRender: yujiRender,
    heroFrame: {
      scale: 1.24,
      maxWidth: '34rem',
      x: '2%',
      y: '2%',
      anchorX: '58%',
      anchorTop: '8%',
      wallpaperX: '6%',
      wallpaperY: '-32%',
    },
    atmosphere: {
      tealGlowOpacity: 0.09,
      tealGlowSize: '38rem',
      accentGlow: 'rgba(59,130,246,0.18)',
      particleTint: 'rgba(5,216,189,0.1)',
      panelTint: 'rgba(5,216,189,0.03)',
    },
    featured: [
      { name: 'Yuji', image: yujiRender, frame: { scale: 1.72, y: '12%' } },
      { name: 'Megumi', image: megumiRender, frame: { scale: 1.72, y: '10%' } },
      { name: 'Nobara', image: nobaraRender, frame: { scale: 1.72, y: '9%' } },
    ],
    ssrRateText: 'SSR Rate: 1.2% � Pity: 34/90',
    pityCurrent: 34,
    pityCap: 90,
    pityTrackMax: 180,
    endsIn: 'Permanent',
    costs: { single: 300, ten: 3000 },
  },
]

type RateRow = {
  label: string
  chance: string
  notes?: string
}

const rateTable: Array<{ tier: string; rows: RateRow[] }> = [
  {
    tier: 'LIMITED BANNER',
    rows: [
      { label: 'SSR Featured', chance: '0.6%', notes: 'Rate-up target on active limited banner' },
      { label: 'SSR Off-Banner', chance: '0.6%', notes: 'Standard SSR pool' },
      { label: 'SR', chance: '8.8%', notes: 'Guaranteed SR+ on x10 pull' },
      { label: 'R', chance: '90.0%', notes: 'Standard pool' },
    ],
  },
  {
    tier: 'STANDARD BANNER',
    rows: [
      { label: 'SSR', chance: '1.2%', notes: 'No featured unit' },
      { label: 'SR', chance: '8.8%', notes: 'Guaranteed SR+ on x10 pull' },
      { label: 'R', chance: '90.0%', notes: 'Standard pool' },
    ],
  },
]

export function SummonPage() {
  const [activeBannerId, setActiveBannerId] = useState<BannerId>('limited-gojo')
  const [isRatesOpen, setIsRatesOpen] = useState(false)

  const activeBanner = summonBanners.find((banner) => banner.id === activeBannerId) ?? summonBanners[0]

  useEffect(() => {
    if (!isRatesOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsRatesOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isRatesOpen])

  return (
    <>
      <section className="relative isolate h-full min-h-0 py-4 sm:py-6">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <SummonAtmosphere banner={activeBanner} />
        </div>

        <div className="relative grid h-full min-h-0 grid-rows-[auto_1fr_auto] gap-4 xl:gap-5">
          <BannerTabs
            activeBannerId={activeBannerId}
            onSelectBanner={setActiveBannerId}
            onOpenRates={() => setIsRatesOpen(true)}
          />

          <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:gap-6">
            <BannerInfoPanel banner={activeBanner} />
            <FeaturedHeroPanel banner={activeBanner} />
          </div>

          <SummonActions banner={activeBanner} />
        </div>
      </section>

      {isRatesOpen ? <RatesModal onClose={() => setIsRatesOpen(false)} /> : null}
    </>
  )
}

function BannerTabs({
  activeBannerId,
  onSelectBanner,
  onOpenRates,
}: {
  activeBannerId: BannerId
  onSelectBanner: (id: BannerId) => void
  onOpenRates: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-white/7 bg-[rgba(12,13,18,0.22)] px-3 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {summonBanners.map((banner) => {
          const active = banner.id === activeBannerId
          return (
            <button
              key={banner.id}
              type="button"
              onClick={() => onSelectBanner(banner.id)}
              className={[
                'ca-mono-label relative shrink-0 rounded-md px-2.5 py-2 text-[0.55rem] transition',
                active ? 'text-ca-text' : 'text-ca-text-3 hover:text-ca-text-2',
              ].join(' ')}
            >
              {banner.navLabel}
              <span
                className={[
                  'absolute inset-x-2 bottom-0 h-[2px] rounded-full transition',
                  active ? 'bg-ca-teal shadow-[0_0_12px_rgba(5,216,189,0.34)]' : 'bg-transparent',
                ].join(' ')}
              />
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onOpenRates}
        className="ca-mono-label shrink-0 rounded-md border border-white/10 bg-[rgba(18,19,26,0.28)] px-3 py-2 text-[0.52rem] text-ca-text-2 transition hover:border-ca-teal/35 hover:text-ca-teal"
      >
        View Rates
      </button>
    </div>
  )
}

function BannerInfoPanel({ banner }: { banner: SummonBanner }) {
  return (
    <section className="ca-card h-full min-h-0 border-white/8 bg-[rgba(14,15,21,0.2)] shadow-[0_14px_34px_rgba(0,0,0,0.16)]">
      <div className="flex h-full min-h-0 flex-col p-4 sm:p-5 xl:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ca-mono-label rounded-full border border-ca-teal/35 bg-ca-teal-wash-mid px-3 py-1 text-[0.52rem] text-ca-teal shadow-[0_0_18px_rgba(5,216,189,0.08)]">
            {banner.bannerType}
          </span>
          <span className="ca-mono-label rounded-full border border-white/10 bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[0.5rem] text-ca-text-3">
            CURSED ENERGY ECHO
          </span>
        </div>

        <div className="mt-4">
          <h1 className="ca-display text-[2.35rem] leading-none text-ca-text sm:text-[2.75rem]">
            {banner.title}
          </h1>
          <p className="mt-2 font-[var(--font-display-alt)] text-[0.95rem] font-semibold text-ca-teal">
            {banner.subtitle}
          </p>
        </div>

        <div className="mt-6 rounded-[10px] border border-white/7 bg-[rgba(16,17,23,0.16)] p-4">
          <p className="ca-mono-label text-[0.5rem] text-ca-text-3">FEATURED</p>
          <div className="mt-3 flex flex-wrap gap-4">
            {banner.featured.map((unit) => (
              <FeaturedPortraitChip key={`${banner.id}-${unit.name}`} unit={unit} />
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-[10px] border border-white/7 bg-[rgba(14,15,21,0.12)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="ca-mono-label text-[0.54rem] text-ca-text-3">{banner.ssrRateText}</p>
            <p className="ca-mono-label text-[0.5rem] text-ca-text-disabled">
              ENDS IN {banner.endsIn}
            </p>
          </div>

          <div className="mt-3">
            <PityTrack current={banner.pityCurrent} max={banner.pityTrackMax} hardPity={banner.pityCap} />
          </div>
        </div>

        <div className="mt-auto hidden xl:block">
          <div className="rounded-[10px] border border-ca-teal/12 bg-[linear-gradient(120deg,rgba(5,216,189,0.06),rgba(5,216,189,0.02),transparent)] p-4">
            <p className="ca-mono-label text-[0.5rem] text-ca-teal">BANNER NOTE</p>
            <p className="mt-2 text-sm leading-6 text-ca-text-2">
              Pity carries across banners of the same type. Featured rate-up rotates, but your progress stays.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturedPortraitChip({ unit }: { unit: FeaturedPortrait }) {
  const frame = unit.frame ?? {}
  const scale = frame.scale ?? 1.55
  const x = frame.x ?? '0%'
  const y = frame.y ?? '8%'

  return (
    <div className="w-[4.75rem] text-center">
      <div className="relative mx-auto h-14 w-14 overflow-hidden rounded-full border border-ca-teal/25 bg-[radial-gradient(circle_at_35%_25%,rgba(228,230,239,0.13),transparent_45%),linear-gradient(160deg,rgba(5,216,189,0.08),rgba(8,9,14,0.3))] shadow-[0_0_18px_rgba(5,216,189,0.08)]">
        <div
          className="absolute left-1/2 top-[8%] w-[86%]"
          style={{ transform: `translate(-50%, 0) translate(${x}, ${y}) scale(${scale})`, transformOrigin: 'top center' }}
        >
          <img src={unit.image} alt={unit.name} className="block h-auto w-full select-none" draggable={false} />
        </div>
      </div>
      <p className="ca-mono-label mt-2 truncate text-[0.42rem] text-ca-text-2">{unit.name}</p>
    </div>
  )
}

function PityTrack({ current, max, hardPity }: { current: number; max: number; hardPity: number }) {
  const safeCurrent = Math.max(0, Math.min(max, current))
  const fillPct = (safeCurrent / max) * 100
  const markers = [80, 160]

  return (
    <div>
      <div className="relative h-2 w-full rounded-full border border-ca-teal/10 bg-[rgba(255,255,255,0.04)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-ca-teal-deep via-ca-teal to-ca-teal-glow shadow-[0_0_18px_rgba(5,216,189,0.28)]"
          style={{ width: `${fillPct}%` }}
        />
        <div className="absolute inset-0 rounded-full opacity-60 [background:linear-gradient(90deg,rgba(255,255,255,0.06)_0%,transparent_8%,transparent_92%,rgba(255,255,255,0.04)_100%)]" />
        {markers.map((marker) => {
          const left = `${(marker / max) * 100}%`
          const passed = safeCurrent >= marker
          return (
            <span
              key={marker}
              className="absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left,
                background: passed ? 'rgba(5,216,189,0.85)' : 'rgba(228,230,239,0.16)',
                boxShadow: passed ? '0 0 10px rgba(5,216,189,0.28)' : 'none',
              }}
            />
          )
        })}
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ca-teal/70 bg-ca-void shadow-[0_0_14px_rgba(5,216,189,0.38)]"
          style={{ left: `${fillPct}%` }}
        >
          <span className="absolute inset-[2px] rounded-full bg-ca-teal" />
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 items-center text-[0.46rem]">
        <span className="ca-mono-label text-ca-text-3">0</span>
        <div className="flex items-center justify-center gap-6">
          <span className="ca-mono-label text-ca-text-3">80</span>
          <span className="ca-mono-label text-ca-text-3">160</span>
        </div>
        <span className="ca-mono-label text-right text-ca-text-3">{hardPity} HARD PITY</span>
      </div>
    </div>
  )
}

function FeaturedHeroPanel({ banner }: { banner: SummonBanner }) {
  const hero = banner.heroFrame
  const wallpaperX = hero.wallpaperX ?? '0%'
  const wallpaperY = hero.wallpaperY ?? '-28%'

  return (
    <section className="relative min-h-[28rem] overflow-hidden rounded-[12px] border border-white/8 bg-[rgba(12,13,19,0.16)] xl:min-h-0">
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(145deg, ${banner.atmosphere.panelTint}, rgba(8,9,14,0.22) 38%, rgba(8,9,14,0.1) 100%)` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(88%_70%_at_76%_20%,rgba(228,230,239,0.08),transparent_62%),linear-gradient(180deg,rgba(8,9,14,0.04),rgba(8,9,14,0.42))]" />
      <TealParticles tint={banner.atmosphere.particleTint} />

      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          left: '70%',
          top: '36%',
          width: banner.atmosphere.tealGlowSize,
          height: banner.atmosphere.tealGlowSize,
          background: `radial-gradient(circle, rgba(5,216,189,${banner.atmosphere.tealGlowOpacity}) 0%, rgba(5,216,189,${(
            banner.atmosphere.tealGlowOpacity * 0.34
          ).toFixed(2)}) 36%, transparent 72%)`,
        }}
      />
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{
          left: '61%',
          top: '35%',
          width: '22rem',
          height: '22rem',
          background: `radial-gradient(circle, ${banner.atmosphere.accentGlow} 0%, transparent 72%)`,
        }}
      />

      <div className="pointer-events-none absolute left-1/2 top-[35%] z-[1] -translate-x-1/2 -translate-y-1/2">
        <p
          className="ca-display select-none leading-none tracking-[0.08em] text-white [mask-image:linear-gradient(90deg,transparent_0%,black_10%,black_90%,transparent_100%)]"
          style={{
            opacity: 0.1,
            fontSize: 'clamp(6rem, 9vw, 10rem)',
            transform: `translate(${wallpaperX}, ${wallpaperY})`,
          }}
        >
          {banner.wordmark}
        </p>
      </div>

      <div className="absolute inset-0 z-[2] overflow-hidden">
        <div
          className="absolute"
          style={{
            left: hero.anchorX,
            top: hero.anchorTop,
            width: hero.maxWidth,
            maxWidth: '92%',
            transform: `translate(-50%, 0) translate(${hero.x}, ${hero.y}) scale(${hero.scale})`,
            transformOrigin: 'top center',
          }}
        >
          <img
            src={banner.heroRender}
            alt={`${banner.title} featured summon banner`}
            className="block h-auto w-full select-none"
            draggable={false}
            style={{
              filter:
                'drop-shadow(0 26px 28px rgba(0,0,0,0.26)) drop-shadow(0 -4px 18px rgba(228,230,239,0.12)) drop-shadow(-12px 0 26px rgba(5,216,189,0.16))',
            }}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-[34%] bg-[linear-gradient(180deg,rgba(8,9,14,0)_0%,rgba(8,9,14,0.16)_28%,rgba(8,9,14,0.52)_64%,rgba(8,9,14,0.88)_100%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-[3] w-[14%] bg-[linear-gradient(90deg,rgba(8,9,14,0)_0%,rgba(8,9,14,0.18)_60%,rgba(8,9,14,0.34)_100%)]" />
    </section>
  )
}

function SummonActions({ banner }: { banner: SummonBanner }) {
  return (
    <section className="relative rounded-[12px] border border-white/8 bg-[rgba(12,13,19,0.22)] px-4 py-4 backdrop-blur-sm sm:px-5 sm:py-5">
      <div className="pointer-events-none absolute inset-0 rounded-[12px] bg-[radial-gradient(75%_120%_at_50%_0%,rgba(5,216,189,0.07),transparent_65%)]" />

      <div className="relative">
        <div className="mb-4 flex items-center justify-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full border border-ca-teal/25 bg-ca-teal-wash-mid text-[0.8rem] text-ca-teal">
            ?
          </span>
          <span className="ca-mono-label text-[0.72rem] text-ca-teal">6,920</span>
        </div>

        <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          <PullButton kind="single" cost={banner.costs.single} />
          <PullButton kind="ten" cost={banner.costs.ten} />
        </div>
      </div>
    </section>
  )
}

function PullButton({ kind, cost }: { kind: 'single' | 'ten'; cost: number }) {
  const isTen = kind === 'ten'

  return (
    <button
      type="button"
      className={[
        'group relative overflow-hidden rounded-xl border text-center transition duration-200',
        isTen
          ? 'border-ca-red/55 bg-gradient-to-b from-[#ff3150] to-[#f31f3d] px-4 py-4 shadow-[0_18px_46px_rgba(250,39,66,0.22)] hover:scale-[1.01] hover:shadow-[0_22px_56px_rgba(250,39,66,0.28)]'
          : 'border-white/12 bg-[rgba(16,17,23,0.26)] px-4 py-4 shadow-[0_12px_28px_rgba(0,0,0,0.16)] hover:border-ca-teal/35 hover:bg-[rgba(16,17,23,0.34)]',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100',
          isTen
            ? 'bg-[radial-gradient(80%_65%_at_50%_15%,rgba(255,255,255,0.18),transparent_62%)]'
            : 'bg-[radial-gradient(70%_55%_at_50%_15%,rgba(5,216,189,0.12),transparent_62%)]',
        ].join(' ')}
      />

      <div className="relative">
        <p className={['ca-display text-[2rem] sm:text-[2.25rem]', isTen ? 'text-white' : 'text-ca-text'].join(' ')}>
          {isTen ? 'Summon x10' : 'Summon x1'}
        </p>
        <p className={['ca-mono-label mt-1 text-[0.5rem]', isTen ? 'text-white/90' : 'text-ca-teal'].join(' ')}>
          {cost.toLocaleString()} GEMS
        </p>
        {isTen ? (
          <p className="ca-mono-label mt-1 text-[0.46rem] text-white/85">(GUARANTEED SR+)</p>
        ) : null}
      </div>
    </button>
  )
}

function SummonAtmosphere({ banner }: { banner: SummonBanner }) {
  return (
    <>
      <div className="absolute -left-24 top-[24%] h-[22rem] w-[22rem] rounded-full bg-ca-teal/8 blur-3xl" />
      <div className="absolute right-[8%] top-[4%] h-[26rem] w-[26rem] rounded-full blur-3xl" style={{ background: `rgba(5,216,189,${(banner.atmosphere.tealGlowOpacity * 0.9).toFixed(2)})` }} />
      <div className="absolute right-[22%] top-[18%] h-[18rem] w-[18rem] rounded-full blur-3xl" style={{ background: banner.atmosphere.accentGlow }} />
      <div className="absolute inset-0 opacity-45 [background:radial-gradient(65%_70%_at_74%_24%,rgba(5,216,189,0.08),transparent_58%),radial-gradient(55%_60%_at_70%_38%,rgba(5,216,189,0.04),transparent_62%),radial-gradient(60%_70%_at_18%_70%,rgba(18,22,38,0.36),transparent_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,14,0.12),rgba(8,9,14,0.28))]" />
    </>
  )
}

function TealParticles({ tint }: { tint: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-80">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            `radial-gradient(circle at 12% 20%, ${tint} 0 1px, transparent 2px)`,
            `radial-gradient(circle at 28% 32%, rgba(5,216,189,0.08) 0 1px, transparent 2px)`,
            `radial-gradient(circle at 76% 18%, rgba(5,216,189,0.12) 0 1px, transparent 2px)`,
            `radial-gradient(circle at 64% 46%, rgba(228,230,239,0.05) 0 1px, transparent 2px)`,
            `radial-gradient(circle at 82% 38%, rgba(5,216,189,0.09) 0 1px, transparent 2px)`,
            `radial-gradient(circle at 72% 62%, rgba(5,216,189,0.08) 0 1px, transparent 2px)`,
          ].join(','),
        }}
      />
      <div className="absolute inset-0 opacity-40 [background:linear-gradient(120deg,transparent_0%,rgba(5,216,189,0.05)_22%,transparent_36%,transparent_58%,rgba(5,216,189,0.04)_66%,transparent_80%)]" />
    </div>
  )
}

function RatesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close rates modal"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-3xl rounded-[12px] border border-white/10 bg-[rgba(11,12,17,0.95)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4 sm:px-5">
          <div>
            <p className="ca-display text-3xl text-ca-text">Drop Rates</p>
            <p className="ca-mono-label mt-1 text-[0.5rem] text-ca-text-3">
              Visible probability table (gacha transparency)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ca-mono-label rounded-md border border-white/10 px-3 py-2 text-[0.52rem] text-ca-text-2 hover:border-ca-teal/35 hover:text-ca-teal"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4">
            {rateTable.map((section) => (
              <section key={section.tier} className="rounded-[10px] border border-white/8 bg-[rgba(17,18,24,0.38)]">
                <div className="border-b border-white/6 px-4 py-3">
                  <p className="ca-mono-label text-[0.52rem] text-ca-teal">{section.tier}</p>
                </div>
                <div className="divide-y divide-white/6">
                  {section.rows.map((row) => (
                    <div key={`${section.tier}-${row.label}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm text-ca-text">{row.label}</p>
                        {row.notes ? <p className="mt-1 text-xs text-ca-text-3">{row.notes}</p> : null}
                      </div>
                      <p className="ca-mono-label text-[0.58rem] text-ca-text-2">{row.chance}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-4 rounded-[10px] border border-ca-teal/12 bg-[linear-gradient(120deg,rgba(5,216,189,0.06),rgba(5,216,189,0.02),transparent)] p-4 text-sm leading-6 text-ca-text-2">
            <p>
              Pity progress is shown on the active banner. Limited-banner pity carries between limited banners. Standard pity carries within the standard pool.
            </p>
            <p className="mt-2 text-ca-text-3">
              Exact rates and pity rules should be finalized with backend values before launch.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}



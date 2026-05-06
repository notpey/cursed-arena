export function LadderHeroCard({ title, subtitle, description }: { title: string; subtitle: string; description: string }) {
  return (
    <div className="border-b border-dotted border-white/12 pb-3">
      <p className="ca-mono-label text-[0.44rem] text-ca-text-3 tracking-[0.1em]">{subtitle.toUpperCase()}</p>
      <h1 className="ca-display mt-1 text-[1.85rem] leading-none tracking-[0.05em] text-ca-text">{title}</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-[1.65] text-ca-text-2">{description}</p>
    </div>
  )
}

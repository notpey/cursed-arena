export function LadderHeroCard({ title, subtitle, description }: { title: string; subtitle: string; description: string }) {
  return (
    <section className="ca-card bg-[radial-gradient(80%_110%_at_0%_30%,rgba(250,39,66,0.09),transparent_60%),radial-gradient(80%_110%_at_100%_15%,rgba(5,216,189,0.08),transparent_64%),rgba(14,15,20,0.18)] p-5">
      <p className="ca-mono-label text-[0.5rem] text-ca-teal">{subtitle}</p>
      <h1 className="ca-display mt-2 text-5xl text-ca-text sm:text-6xl">{title}</h1>
      <p className="mt-3 max-w-4xl text-sm text-ca-text-2">{description}</p>
    </section>
  )
}

type PlaceholderPageProps = {
  title: string
  subtitle: string
}

export function PlaceholderPage({ title, subtitle }: PlaceholderPageProps) {
  return (
    <div className="grid min-h-[calc(100vh-8rem)] place-items-center py-8">
      <section className="ca-card w-full max-w-3xl p-8 text-center">
        <p className="ca-mono-label text-[0.65rem] text-ca-teal">Page Scaffolded</p>
        <h1 className="ca-display mt-3 text-5xl text-ca-text sm:text-6xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-ca-text-2 sm:text-base">{subtitle}</p>
      </section>
    </div>
  )
}


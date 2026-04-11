import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="grid min-h-[calc(100vh-8rem)] place-items-center py-8">
      <section className="ca-card w-full max-w-xl p-8 text-center">
        <p className="ca-mono-label text-[0.65rem] text-ca-text-3">404</p>
        <h1 className="ca-display mt-2 text-5xl">Page Not Found</h1>
        <p className="mt-3 text-sm text-ca-text-2">The page you requested could not be found.</p>
        <Link
          to="/"
          className="ca-display mt-6 inline-flex rounded-lg border border-ca-red/40 bg-ca-red px-5 py-3 text-2xl text-white"
        >
          Return Home
        </Link>
      </section>
    </div>
  )
}

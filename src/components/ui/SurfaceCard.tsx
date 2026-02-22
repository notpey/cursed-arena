import type { PropsWithChildren } from 'react'

type SurfaceCardProps = PropsWithChildren<{
  className?: string
}>

export function SurfaceCard({ className = '', children }: SurfaceCardProps) {
  return <section className={`ca-card ca-card-hover ${className}`.trim()}>{children}</section>
}


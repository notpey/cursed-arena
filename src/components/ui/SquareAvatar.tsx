type SquareAvatarProps = {
  src?: string | null
  alt: string
  fallbackLabel?: string
  size?: number
  className?: string
}

export function SquareAvatar({
  src,
  alt,
  fallbackLabel,
  size = 100,
  className = '',
}: SquareAvatarProps) {
  const label = (fallbackLabel ?? alt)
    .split(/\s+|_+|-/)
    .map((part) => part[0] ?? '')
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 5)

  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden border border-black bg-[linear-gradient(145deg,rgba(5,216,189,0.14),rgba(250,39,66,0.08),rgba(18,18,24,0.78))] ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="ca-display px-2 text-center text-2xl text-ca-text">{label || '?'}</span>
      )}
    </div>
  )
}

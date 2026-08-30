// FreeJobPost logomark. The posting card and plus sign keep this product
// visually separate from the Ava Health cross-and-leaf identity.

type Variant = 'full' | 'mono'
type Theme = 'light' | 'dark'

type LogoProps = {
  size?: number
  variant?: Variant
  theme?: Theme
  className?: string
}

export function Logo({
  size = 32,
  variant = 'full',
  theme = 'light',
  className = '',
}: LogoProps) {
  const navy = '#17324D'
  const green = '#276749'
  const isMono = variant === 'mono'
  const baseColor = theme === 'dark' ? '#FFFFFF' : navy
  const accentColor = isMono ? baseColor : green

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="FreeJobPost"
      role="img"
    >
      <rect x="8" y="8" width="48" height="48" rx="12" fill={baseColor} />
      <rect x="17" y="19" width="24" height="4" rx="2" fill="white" />
      <rect x="17" y="29" width="18" height="4" rx="2" fill="white" opacity="0.9" />
      <rect x="17" y="39" width="13" height="4" rx="2" fill="white" opacity="0.75" />
      <circle cx="44" cy="43" r="10" fill={accentColor} stroke="white" strokeWidth="2" />
      <path d="M44 38v10M39 43h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export default Logo

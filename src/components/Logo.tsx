// Ava Health logomark — navy medical cross + lime leaf.
//
// Flat-geometric merge of the existing illustrated cross+leaf mark with
// scaleability-first construction. Keeps the brand metaphor (healthcare +
// growth) but drops the glossy/3D/gradient treatment so the mark reads
// cleanly from 16px favicon up to 240px hero lockup.
//
// Copied verbatim from avahealth-providers/src/components/Logo.tsx so the
// whole family shows the SAME mark beside the wordmark (no shared package).

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
  const navy = '#003D5C'
  const lime = '#7FBC00'
  const limeDark = '#5C9900'
  const isMono = variant === 'mono'
  const baseColor = theme === 'dark' ? '#FFFFFF' : navy
  const leafColor = isMono ? baseColor : lime
  const veinColor = isMono ? baseColor : limeDark
  const veinOpacity = isMono ? 0.4 : 0.55

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Ava Health"
      role="img"
    >
      <g fill={baseColor}>
        <rect x="21" y="6" width="10" height="36" rx="2.5" />
        <rect x="7" y="20" width="38" height="10" rx="2.5" />
      </g>
      <g>
        <path
          d="M 34 22
             C 50 22, 58 32, 58 45
             C 58 56, 46 60, 34 57
             C 27 51, 27 33, 34 22 Z"
          fill={leafColor}
        />
        <path
          d="M 36 27 Q 44 40, 47 55"
          stroke={veinColor}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity={veinOpacity}
        />
      </g>
    </svg>
  )
}

export default Logo

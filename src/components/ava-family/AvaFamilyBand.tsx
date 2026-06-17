// Ava Health family band — shared "part of Ava Health" footer strip.
//
// One drop-in component used across every Ava family site (freejobpost,
// freeresumepost, Beacon, and the Ava-owned Next apps). It signals the
// parent brand and cross-links the family without changing each app's own
// accent color. This is the endorsed-house pattern: every site keeps its
// look, every site wears the same Ava family strip.
//
// Self-contained on purpose. The Ava mark SVG and the family map are
// inlined here so the file copies cleanly between repos with no shared
// package or token dependency. Brand colors are inline styles (navy +
// lime) so the strip renders the same regardless of the host app's
// Tailwind config. Layout uses plain Tailwind utilities (present in every
// app).
//
// Usage:  <AvaFamilyBand currentSite="freejob" />
//
// All family links are cross-domain, so we use plain <a> (not next/link).

const NAVY = '#003D5C'
const LIME = '#7FBC00'

export type FamilySite =
  | 'ava'
  | 'crm'
  | 'providers'
  | 'freejob'
  | 'freeresume'
  | 'beacon'

type FamilyMember = {
  key: FamilySite
  label: string
  blurb: string
  href: string
}

// Canonical family map. Order is intentional: parent first, then the
// public tools. Beacon is invite-only and pre-launch, so it is hidden on
// public sites and only shown on Beacon's own site (or when includeBeacon
// is set).
const FAMILY: FamilyMember[] = [
  { key: 'ava', label: 'Ava Health', blurb: 'Healthcare recruiting', href: 'https://avahealth.co' },
  { key: 'crm', label: 'For recruiters', blurb: 'Recruiter platform', href: 'https://app.avahealth.co' },
  { key: 'providers', label: 'Provider directory', blurb: 'Look up any provider', href: 'https://providers.avahealth.co' },
  { key: 'freejob', label: 'Healthcare jobs', blurb: 'Post and find jobs free', href: 'https://freejobpost.co' },
  { key: 'freeresume', label: 'Resume tool', blurb: 'Post your resume free', href: 'https://www.freeresumepost.co' },
  { key: 'beacon', label: 'Beacon', blurb: 'Recruiter outreach', href: 'https://beacon.careers' },
]

function AvaMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
    >
      <g fill={NAVY}>
        <rect x="21" y="6" width="10" height="36" rx="2.5" />
        <rect x="7" y="20" width="38" height="10" rx="2.5" />
      </g>
      <g>
        <path
          d="M 34 22 C 50 22, 58 32, 58 45 C 58 56, 46 60, 34 57 C 27 51, 27 33, 34 22 Z"
          fill={LIME}
        />
        <path
          d="M 36 27 Q 44 40, 47 55"
          stroke="#5C9900"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity={0.55}
        />
      </g>
    </svg>
  )
}

export function AvaFamilyBand({
  currentSite,
  includeBeacon = false,
  className = '',
}: {
  currentSite: FamilySite
  includeBeacon?: boolean
  className?: string
}) {
  const members = FAMILY.filter(
    (m) => m.key !== 'beacon' || includeBeacon || currentSite === 'beacon'
  )

  return (
    <section
      aria-label="The Ava Health family"
      className={`border-t border-gray-200 pt-8 mb-8 ${className}`}
    >
      <div className="flex items-center gap-2.5 mb-1.5">
        <AvaMark size={26} />
        <span
          className="text-sm font-bold tracking-tight"
          style={{ color: NAVY }}
        >
          Part of Ava Health
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-5 max-w-xl">
        Free hiring tools and a recruiter platform for US healthcare.
      </p>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-4">
        {members.map((m) => {
          const isCurrent = m.key === currentSite
          const inner = (
            <>
              <span
                className="block text-sm font-semibold"
                style={{ color: isCurrent ? NAVY : undefined }}
              >
                {m.label}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                {isCurrent ? "You're here" : m.blurb}
              </span>
            </>
          )
          return (
            <li key={m.key}>
              {isCurrent ? (
                <div className="relative pl-3">
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: LIME }}
                  />
                  {inner}
                </div>
              ) : (
                <a
                  href={m.href}
                  className="block group hover:opacity-80 transition-opacity"
                >
                  {inner}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default AvaFamilyBand

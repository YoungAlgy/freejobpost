// Ava Health family nav — slim top strip that cross-links the Ava Health
// sections (Jobs, Resumes, Provider directory, Recruiter platform) on every
// page, so the whole family reads as one site. Companion to AvaFamilyBand (the
// footer version). Self-contained on purpose so it copies cleanly between repos
// with no shared package or token dependency — navy strip, white text, lime
// "you are here". All links are cross-domain, so plain <a> (not next/link).
//
// Usage:  <AvaFamilyNav currentSite="freejob" />

const NAVY = '#003D5C'
const LIME = '#7FBC00'

export type FamilyNavSite = 'crm' | 'providers' | 'freejob' | 'freeresume'

const SECTIONS: { key: FamilyNavSite; label: string; href: string }[] = [
  { key: 'freejob', label: 'Jobs', href: 'https://freejobpost.co' },
  { key: 'freeresume', label: 'Resumes', href: 'https://www.freeresumepost.co' },
  { key: 'providers', label: 'Find Providers', href: 'https://providers.avahealth.co' },
  { key: 'crm', label: 'For Recruiters', href: 'https://app.avahealth.co' },
]

export function AvaFamilyNav({ currentSite }: { currentSite: FamilyNavSite }) {
  return (
    <nav aria-label="Ava Health" style={{ backgroundColor: NAVY }} className="text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-9 flex items-center justify-between gap-3">
        <a
          href="https://avahealth.co"
          className="text-[13px] font-bold tracking-tight text-white hover:opacity-90 transition-opacity shrink-0"
        >
          Ava Health
        </a>
        <ul className="flex items-center gap-3.5 sm:gap-6 text-[12px] sm:text-[13px] font-medium">
          {SECTIONS.map((s) => {
            const isCurrent = s.key === currentSite
            return (
              <li key={s.key}>
                {isCurrent ? (
                  <span
                    aria-current="page"
                    className="inline-flex items-center gap-1.5 whitespace-nowrap"
                    style={{ color: LIME }}
                  >
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LIME }} />
                    {s.label}
                  </span>
                ) : (
                  <a href={s.href} className="text-white/80 hover:text-white transition-colors whitespace-nowrap">
                    {s.label}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}

export default AvaFamilyNav

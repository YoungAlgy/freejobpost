// Ava Health careers sub-nav — a light strip that ties freejobpost.co and
// freeresumepost.co together as ONE careers tool with three tabs (Find Jobs,
// Post a Resume, For Employers). It sits directly under each site's own nav
// (and under the navy AvaFamilyNav family strip), so whichever domain a
// visitor lands on, the job board and the resume tool read as one product.
//
// Self-contained on purpose so it copies cleanly between repos with no shared
// package — inline navy/lime via Tailwind arbitrary values so it renders
// identically on freejob (bold) and freeresume (soft). All links are
// cross-domain, so plain <a> (not next/link).
//
// Usage:  <AvaCareersNav currentSection="jobs" />

export type CareersSection = 'jobs' | 'resume' | 'employers'

const SECTIONS: { key: CareersSection; label: string; href: string }[] = [
  { key: 'jobs', label: 'Find Jobs', href: 'https://freejobpost.co/jobs' },
  { key: 'resume', label: 'Post a Resume', href: 'https://www.freeresumepost.co/upload' },
  { key: 'employers', label: 'For Employers', href: 'https://freejobpost.co/for-employers' },
]

export function AvaCareersNav({ currentSection }: { currentSection: CareersSection }) {
  return (
    <nav aria-label="Ava Health Careers" className="border-b border-[#003D5C]/10 bg-[#F1F6F9]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-11 flex items-center gap-4 sm:gap-7 overflow-x-auto">
        <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-widest text-slate-600 shrink-0">
          Careers
        </span>
        <ul className="flex items-center gap-5 sm:gap-7 text-[13px] sm:text-sm font-semibold">
          {SECTIONS.map((s) => {
            const isCurrent = s.key === currentSection
            return (
              <li key={s.key}>
                <a
                  href={s.href}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={
                    isCurrent
                      ? 'inline-flex items-center gap-1.5 whitespace-nowrap font-bold text-[#003D5C]'
                      : 'inline-flex items-center gap-1.5 whitespace-nowrap text-slate-600 hover:text-[#003D5C] transition-colors'
                  }
                >
                  {isCurrent && (
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#7FBC00]" />
                  )}
                  {s.label}
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}

export default AvaCareersNav

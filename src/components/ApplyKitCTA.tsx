// Cross-promo bridge: freejobpost.co job-seeker traffic → the resume-tailoring
// feature on freeresumepost.co. Placed right after the reader finishes the
// job description, peak intent to actually apply well to this specific role.
//
// Formerly linked to a separate paid product (applykit-beryl.vercel.app).
// That product's tailoring logic now lives natively on freeresumepost.co as
// a free, logged-in feature (/account/tailor) — so this points there instead.
// Cross-domain -> plain <a>. A visitor without a freeresumepost account just
// hits the existing upload/sign-in flow first.

const TAILOR_URL =
  process.env.NEXT_PUBLIC_TAILOR_URL ??
  'https://www.freeresumepost.co/account/tailor?utm_source=freejobpost&utm_medium=referral&utm_campaign=job_cta'

type Props = {
  /** e.g. "Medical Assistant" — used to make the pitch feel specific, not generic */
  jobTitle?: string | null
}

export default function ApplyKitCTA({ jobTitle }: Props) {
  const role = (jobTitle || '').trim()

  return (
    <aside className="rounded-xl border border-gray-200 shadow-sm bg-blue-50 p-5 md:p-6">
      <p className="text-[11px] font-bold tracking-widest text-[#003D5C] uppercase mb-2">
        Before you apply
      </p>
      <h3 className="text-xl md:text-2xl font-black tracking-tight leading-tight mb-2 text-[#003D5C]">
        {role ? `Tailor your resume for this ${role} job` : 'Tailor your resume for this job'}
      </h3>
      <p className="text-sm text-gray-800 mb-4 leading-relaxed max-w-xl">
        Paste this posting and we&apos;ll rewrite your bullets to match what this job actually wants,
        write you a real cover letter, and prep you for the interview questions they&apos;ll probably ask.
        Free, using the resume on your freeresumepost account.
      </p>
      <a
        href={TAILOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center bg-[#003D5C] text-white px-5 py-2.5 font-bold rounded-lg hover:bg-[#002a42] transition-colors"
      >
        Tailor my resume →
      </a>
    </aside>
  )
}

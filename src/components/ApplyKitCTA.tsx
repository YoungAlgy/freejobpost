// Cross-promo bridge: freejobpost.co job-seeker traffic → ApplyKit (Algy's own
// product, not an affiliate). Placed right after the reader finishes the job
// description, peak intent to actually apply well to this specific role.
//
// First-party, so no approval gate like lib/affiliates.ts — always renders.
// The outbound link carries UTM params so ApplyKit can attribute signups back
// to this bridge. Cross-domain -> plain <a>.
//
// NOTE: "applykit.vercel.app" is NOT ours — that global vanity alias is
// already taken by an unrelated live product (an ATS at applykit.co). Vercel
// assigned "applykit-beryl.vercel.app" as our stable alias instead. Update
// via NEXT_PUBLIC_APPLYKIT_URL once Algy picks a permanent custom domain
// (possibly a rename, given the name collision) — don't let this go stale.

const APPLYKIT_URL =
  process.env.NEXT_PUBLIC_APPLYKIT_URL ??
  'https://applykit-beryl.vercel.app?utm_source=freejobpost&utm_medium=referral&utm_campaign=job_cta'

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
        Paste this posting and your resume into ApplyKit. It rewrites your bullets to match what
        this job actually wants, writes you a real cover letter, and preps you for the interview
        questions they will probably ask. First one is free.
      </p>
      <a
        href={APPLYKIT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center bg-[#003D5C] text-white px-5 py-2.5 font-bold rounded-lg hover:bg-[#002a42] transition-colors"
      >
        Tailor my resume free →
      </a>
      <p className="text-[11px] text-gray-500 mt-2.5">Built by the person who runs this site.</p>
    </aside>
  )
}

// Conversion bridge: freejobpost.co job-seeker traffic → freeresumepost.co
// candidate uploads. This is the linchpin for the candidate-supply side of
// the marketplace — GSC (2026-06) showed freejob ranking + growing (117
// clicks/28d, page-1) while freeresume gets ~0 search traffic, so the job
// is to convert the traffic we already have into resume uploads.
//
// Contextual by design: pass the page's specialty/role + location so the
// pitch reads "get matched to Medical Assistant roles in Texas", not a
// generic banner. Renders nothing differently if context is absent.
//
// The outbound link carries UTM params so freeresume can attribute uploads
// back to this bridge (utm_source=freejobpost). Cross-domain → plain <a>.

const UPLOAD_URL =
  'https://www.freeresumepost.co/upload?utm_source=freejobpost&utm_medium=referral&utm_campaign=resume_match'

type Props = {
  /** e.g. "Medical Assistant" — falls back to a generic phrasing when absent */
  specialtyLabel?: string | null
  /** e.g. "Texas" or "Houston, TX" — omitted from copy when absent */
  locationLabel?: string | null
}

export default function ResumeMatchCTA({ specialtyLabel, locationLabel }: Props) {
  const role = (specialtyLabel || '').trim()
  const what = role ? `${role} roles` : 'healthcare roles'
  const where = locationLabel && locationLabel.trim() ? ` in ${locationLabel.trim()}` : ''

  return (
    <aside className="rounded-xl border border-gray-200 shadow-sm bg-green-50 p-5 md:p-6">
      <p className="text-[11px] font-bold tracking-widest text-[#003D5C] uppercase mb-2">
        Stop applying one by one
      </p>
      <h3 className="text-xl md:text-2xl font-black tracking-tight leading-tight mb-2 text-[#003D5C]">
        Upload your resume once. Get matched to {what}
        {where}.
      </h3>
      <p className="text-sm text-gray-800 mb-4 leading-relaxed max-w-xl">
        Drop your resume and we'll match you to new {what} as employers post
        them. No re-applying to each one. Free, no recruiter spam, delete anytime.
      </p>
      <a
        href={UPLOAD_URL}
        className="inline-flex items-center bg-[#7FBC00] text-white px-5 py-2.5 font-bold hover:bg-[#6DA300] transition-colors"
      >
        Upload my resume free →
      </a>
      <p className="text-[11px] text-gray-500 mt-2.5">
        Free for candidates · powered by freeresumepost.co
      </p>
    </aside>
  )
}

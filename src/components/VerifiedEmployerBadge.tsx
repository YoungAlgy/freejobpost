// Green-check badge rendered next to a verified employer's name. An employer
// is considered "verified" when public_employers.verified_at is non-null,
// which is set by the verification flow (one-click confirmation from an
// email at the company domain). This is the differentiator vs. seeded
// inventory placed by Ava Health Partners — verified employers carry the
// signal that there's a real, traceable third-party hiring entity behind
// the listing.
//
// Visual: small inline pill — gray border, green check, "Verified" text.
// Stays subtle so it doesn't dominate the listing UI; the value is just
// showing a trust signal at all.

type Props = {
  /** Override the tooltip / aria-label. Defaults to a stable explanation. */
  title?: string
  /** Hide the "Verified" text — show check only. Useful in dense listings. */
  iconOnly?: boolean
  className?: string
}

export default function VerifiedEmployerBadge({
  title = 'Verified employer. Confirmed via email at the company domain',
  iconOnly = false,
  className = '',
}: Props) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-1 align-baseline ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
        className="text-[#00B5D4] shrink-0"
      >
        {/* Filled check inside a circle — recognizable trust signal */}
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path
          d="M4.5 8.2 L7 10.5 L11.5 5.8"
          fill="none"
          stroke="white"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!iconOnly && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#00B5D4]">
          Verified
        </span>
      )}
    </span>
  )
}

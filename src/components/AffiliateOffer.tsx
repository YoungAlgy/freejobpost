import { getAffiliate } from '@/lib/affiliates'

/**
 * Tasteful affiliate recommendation. Renders NOTHING if the program's link
 * isn't configured yet (env var empty), so it's safe to place anywhere now.
 *
 * FTC + SEO compliant: links are rel="sponsored nofollow" and the block is
 * clearly labeled as a recommendation that may earn a commission.
 *
 * Usage (place near high-intent moments):
 *   <AffiliateOffer program="jobcopilot" />   // on job detail / after Apply
 *   <AffiliateOffer program="resumeio" />     // on resume upload / match pages
 *   <AffiliateOffer program="finalround" />   // on interview-prep content
 */
export default function AffiliateOffer({
  program,
  className = '',
}: {
  program: string
  className?: string
}) {
  const aff = getAffiliate(program)
  if (!aff) return null

  return (
    <aside
      className={`affiliate-offer ${className}`.trim()}
      aria-label="Recommended tool"
      style={{
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'space-between',
        fontSize: 14,
      }}
    >
      <span style={{ flex: '1 1 240px' }}>{aff.label}</span>
      <a
        href={aff.url}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        style={{
          whiteSpace: 'nowrap',
          fontWeight: 600,
          textDecoration: 'underline',
        }}
      >
        {aff.cta}
      </a>
      <span style={{ flexBasis: '100%', fontSize: 11, opacity: 0.6 }}>
        Affiliate link. We may earn a commission, at no cost to you.
      </span>
    </aside>
  )
}

// Hub metadata honesty — overrides the static metaDescription on state/
// specialty hub pages when the actual on-page inventory is sparse or empty.
//
// Why this exists: the state-slugs.ts / specialty-slugs.ts metaDescription
// fields are templated for the "happy path" — when a state has dozens of
// active roles across multiple cities. With 99% seeded inventory, many
// state hubs render with 0 or 1 job, but the static meta still claims
// "Free Florida healthcare jobs — Tampa, Miami, Jacksonville, Orlando,
// Naples. Physician, NP, PA, RN, CRNA roles..." That's an over-claim
// aggregator QA reviewers (Adzuna, Indeed) flag for "page content doesn't
// match meta".
//
// Posture: when inventory is sparse, swap the description for an honest
// version that reflects reality. Page body already does this via the
// in-page yellow warning bar at <3 jobs (state/specialty hub pages); this
// brings the SEO surface in line with the same disclosure norm (S7 in the
// strategic plan).

type HubMetaInput = {
  /** Actual count of active roles on this hub right now. */
  count: number
  /** The configured static description shown when inventory is healthy. */
  staticDescription: string
  /** Human-readable name used in the sparse copy ("Florida", "Cardiology"). */
  label: string
  /** Type of hub — controls which copy variant applies. */
  kind: 'state' | 'specialty'
}

/**
 * Returns the description string to put in the <meta name="description"> tag
 * on a hub page. Picks the static one when inventory is healthy (≥3 active
 * roles) or one of the honest sparse-state variants otherwise.
 */
export function composeHubMetaDescription({
  count,
  staticDescription,
  label,
  kind,
}: HubMetaInput): string {
  if (count >= 3) return staticDescription

  if (count === 0) {
    return kind === 'state'
      ? `No active ${label} healthcare jobs on freejobpost.co right now. Browse hundreds of US healthcare roles — free, no recruiter spam.`
      : `No active ${label.toLowerCase()} on freejobpost.co right now. Browse hundreds of US healthcare roles — free, no recruiter spam.`
  }

  // 1 or 2 jobs — acknowledge sparsity, point to the broader board
  const roleNoun = count === 1 ? 'role' : 'roles'
  return kind === 'state'
    ? `${count} active healthcare ${roleNoun} in ${label} on freejobpost.co. Free to browse, free to apply. See all open US healthcare jobs for more options.`
    : `${count} active ${label.toLowerCase().replace(/ jobs$/, '')} ${roleNoun} on freejobpost.co. Free to browse, free to apply. Most current inventory is in higher-density specialties.`
}

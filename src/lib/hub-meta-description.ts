type HubMetaInput = {
  /** Actual count of active direct-employer roles on this hub. */
  count: number
  /** Human-readable state or specialty name. */
  label: string
  kind: 'state' | 'specialty'
}

/**
 * Build metadata from the live direct-employer count. This avoids carrying
 * aggregate-era inventory claims into a smaller standalone job board.
 */
export function composeHubMetaDescription({
  count,
  label,
  kind,
}: HubMetaInput): string {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  const specialty = label.replace(/ jobs$/i, '').trim().toLowerCase()

  if (kind === 'state') {
    if (safeCount === 0) {
      return `No active nursing or allied health jobs in ${label} right now. Browse current direct employer posts across the US.`
    }
    return `${safeCount} active nursing or allied health ${safeCount === 1 ? 'job' : 'jobs'} in ${label}, posted directly by employers.`
  }

  if (safeCount === 0) {
    return `No active ${specialty} jobs right now. Browse current nursing and allied health roles posted directly by employers.`
  }
  return `${safeCount} active ${specialty} ${safeCount === 1 ? 'job' : 'jobs'}, posted directly by employers.`
}

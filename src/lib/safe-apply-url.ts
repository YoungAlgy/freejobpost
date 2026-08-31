// Validate an employer-provided application URL before redirecting to it.
// Userinfo is rejected because a URL such as https://trusted.example@evil.test
// can make the displayed prefix look like the trusted host while the browser
// actually connects to the host after the @ sign.
export function safeApplyUrl(
  raw: string | null | undefined,
  options: { requireHttps?: boolean } = {},
): string | null {
  if (!raw) return null

  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 500) return null

  try {
    const url = new URL(trimmed)
    if (url.username || url.password) return null

    if (options.requireHttps ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol)) {
      return null
    }

    // Keep the browser and SQL contracts aligned around ordinary DNS names.
    // This excludes IP literals and ambiguous numeric-only host strings.
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(url.hostname)) return null
    if (/^[0-9.]+$/.test(url.hostname)) return null

    const normalized = url.toString()
    if (normalized.length > 500) return null
    return normalized
  } catch {
    return null
  }
}

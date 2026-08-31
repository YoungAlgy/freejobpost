// Validate an employer-provided application URL before redirecting to it.
// Userinfo is rejected because a URL such as https://trusted.example@evil.test
// can make the displayed prefix look like the trusted host while the browser
// actually connects to the host after the @ sign.
export function safeApplyUrl(
  raw: string | null | undefined,
  options: { requireHttps?: boolean } = {},
): string | null {
  if (!raw) return null

  try {
    const url = new URL(raw.trim())
    if (url.username || url.password) return null

    if (options.requireHttps ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol)) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

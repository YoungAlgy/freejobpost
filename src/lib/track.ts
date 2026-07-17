// No-op replacement for @vercel/analytics/server's track(), dropped as part
// of the Cloudflare migration. Keeps the 3 server-action call sites working
// unchanged if a replacement analytics provider gets wired in here later.
export async function track(
  _event: string,
  _props?: Record<string, string | number | boolean | null>,
): Promise<void> {}

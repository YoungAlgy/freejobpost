// User-agent bot filter for analytics endpoints.
//
// Returns true for traffic that should NOT be counted as a user action —
// search-engine crawlers, SEO scrapers, link previewers, headless test
// harnesses, and generic HTTP libraries.
//
// Currently used by:
//   - /click/[slug] (apply_clicks logging — skip the insert on bot UAs)
//
// Background: 2026-05-26 apply_clicks audit showed internal=8951 in one
// day vs ~10-50 typical daily, and spot-check confirmed the spike was
// crawler activity, not real applies. Without filtering the
// `partner_attribution_daily` view + the `internal` baseline are
// meaningless.
//
// Conservative-by-design: matches common crawler signatures only. If a
// real user has one of these strings in their UA (extremely unlikely),
// they lose attribution credit on that click but the apply still works.

const BOT_UA_RE =
  /(bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|preview|fetch|monitor|uptime|pingdom|gtmetrix|lighthouse|headless|puppeteer|playwright|selenium|phantom|httrack|wget|curl|python-requests|python-urllib|go-http-client|java\/|okhttp|apache-httpclient|libwww|axios\/[0-9])/i

export function looksLikeBot(userAgent: string | null): boolean {
  if (!userAgent) return true // missing UA → treat as bot
  return BOT_UA_RE.test(userAgent)
}

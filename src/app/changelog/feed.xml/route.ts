// RSS 2.0 feed of changelog entries.
//
// Lets power users (especially recruiters and employers watching the platform
// mature) subscribe to new ships in Feedly/Inoreader/etc. without scraping.
// guid is the deep-link anchor on /changelog, so readers dedupe correctly
// across edits.

import { CHANGELOG_ENTRIES, entryAnchor } from '@/lib/changelog-entries'

export const revalidate = 3600
export const dynamic = 'force-static'

function escapeXml(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cdata(s: string | null | undefined): string {
  const v = (s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')
  return `<![CDATA[${v}]]>`
}

export async function GET(): Promise<Response> {
  const now = new Date().toUTCString()
  const lastBuild = CHANGELOG_ENTRIES[0]?.date
    ? new Date(CHANGELOG_ENTRIES[0].date + 'T12:00:00Z').toUTCString()
    : now

  const items = CHANGELOG_ENTRIES.map((e) => {
    const anchor = entryAnchor(e)
    const url = `https://freejobpost.co/changelog#${anchor}`
    const pub = new Date(e.date + 'T12:00:00Z').toUTCString()
    return `    <item>
      <title>${escapeXml(e.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="false">freejobpost:changelog:${escapeXml(anchor)}</guid>
      <pubDate>${pub}</pubDate>
      <category>${escapeXml(e.tag)}</category>
      <description>${cdata(e.body)}</description>
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>freejobpost.co — Changelog</title>
    <link>https://freejobpost.co/changelog</link>
    <atom:link href="https://freejobpost.co/changelog/feed.xml" rel="self" type="application/rss+xml" />
    <description>Recent shipped features, fixes, and reliability work on freejobpost.co.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <ttl>60</ttl>
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

// /admin/attribution — partner-attribution dashboard
//
// Renders the partner_attribution_daily SQL view (apply_clicks rolled up
// by partner + day) so we can see at a glance which publisher channel is
// actually driving Apply clicks. Empty until partners (Talent.com,
// Adzuna, Jooble, Careerjet) start crawling our feed and routing apply
// clicks back through /click/[slug]?p=<partner>.
//
// Auth: shared-secret query param gate (ADMIN_DASHBOARD_KEY env var). Not
// a real auth system — protects against accidental discovery via random
// URL guessing. Replace with Supabase Auth + internal-user session check
// when that infrastructure exists. URL pattern:
//   /admin/attribution?key=<shared-secret>
//
// Data path: server-side service-role client bypasses RLS to read the
// view. Service-role key MUST stay on the server (never shipped to the
// browser). The view itself only contains aggregate click data (no PII,
// no employer secrets, no candidate data) so the leak risk if the secret
// rotates is low.

import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type AttributionRow = {
  partner: string
  day: string  // ISO timestamp
  click_count: number
  unique_jobs: number
  unique_ips: number
}

type Props = {
  searchParams: Promise<{ key?: string }>
}

export default async function AttributionDashboard({ searchParams }: Props) {
  const sp = await searchParams
  const expected = process.env.ADMIN_DASHBOARD_KEY

  // Hard 404 if no key env var configured OR key mismatch. Prevents the
  // page from being discoverable when the secret hasn't been set up yet.
  if (!expected || !sp.key || sp.key !== expected) {
    notFound()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    // Service-role key not configured. Don't reveal that to the visitor —
    // 404 looks the same as a wrong key from outside.
    notFound()
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Pull last 30 days of attribution. partner_attribution_daily view gates
  // on is_internal_user(), but service-role bypasses RLS so we get all
  // rows. The view returns one row per (partner, day) — we re-shape into
  // {partner: [...days...]} on the JS side for table rendering.
  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await sb
    .from('partner_attribution_daily')
    .select('partner, day, click_count, unique_jobs, unique_ips')
    .gte('day', sinceIso)
    .order('day', { ascending: false })

  const rows = (data ?? []) as AttributionRow[]

  // Group by partner for the per-partner totals + daily breakdown.
  const byPartner = new Map<string, AttributionRow[]>()
  for (const r of rows) {
    const list = byPartner.get(r.partner) ?? []
    list.push(r)
    byPartner.set(r.partner, list)
  }

  const partnerTotals = Array.from(byPartner.entries())
    .map(([partner, partnerRows]) => ({
      partner,
      totalClicks: partnerRows.reduce((s, r) => s + r.click_count, 0),
      totalJobs: new Set(partnerRows.flatMap((r) => Array(r.unique_jobs).fill(r.day))).size,
      totalIps: partnerRows.reduce((s, r) => s + r.unique_ips, 0),
      days: partnerRows.length,
    }))
    .sort((a, b) => b.totalClicks - a.totalClicks)

  const grandTotal = rows.reduce((s, r) => s + r.click_count, 0)

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Partner-attribution dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">
            Apply clicks rolled up by publisher partner. Last 30 days.
          </p>
        </header>

        {error && (
          <div className="border-2 border-red-400 bg-red-50 p-4 mb-6">
            <p className="text-sm font-bold text-red-800">Query error</p>
            <p className="text-xs font-mono text-red-700 mt-1">{error.message}</p>
          </div>
        )}

        {/* Summary tile */}
        <section className="bg-white border-2 border-black p-6 mb-6">
          <p className="text-xs font-bold tracking-wider text-gray-500">TOTAL APPLY CLICKS (30D)</p>
          <p className="text-5xl font-black mt-2 tabular-nums">{grandTotal.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-2">
            across {byPartner.size} {byPartner.size === 1 ? 'partner' : 'partners'}
          </p>
        </section>

        {/* Per-partner totals */}
        {partnerTotals.length === 0 ? (
          <section className="bg-white border-2 border-black p-8 text-center">
            <p className="text-lg font-bold mb-2">No attribution data yet.</p>
            <p className="text-sm text-gray-600 mb-4">
              Publisher partners haven&apos;t started crawling the feed yet, or no apply clicks
              have arrived from a partner-attributed URL.
            </p>
            <p className="text-xs text-gray-500">
              Submitted 2026-05-20: Talent.com, Adzuna, Jooble. Careerjet pending.
              <br />Once a partner crawls{' '}
              <code className="text-xs">freejobpost.co/jobs.xml?ref=&lt;partner&gt;</code>
              {' '}and the first visitor clicks Apply, a row appears here.
            </p>
          </section>
        ) : (
          <section className="bg-white border-2 border-black mb-6">
            <table className="w-full text-sm">
              <thead className="bg-black text-white text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Partner</th>
                  <th className="text-right px-4 py-3">Clicks (30d)</th>
                  <th className="text-right px-4 py-3">Unique IPs</th>
                  <th className="text-right px-4 py-3">Days active</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black">
                {partnerTotals.map((p) => (
                  <tr key={p.partner} className="hover:bg-green-50">
                    <td className="px-4 py-3 font-bold">{p.partner}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.totalClicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.totalIps.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Daily breakdown (raw rows for debugging / spot-check) */}
        {rows.length > 0 && (
          <section className="bg-white border-2 border-black">
            <h2 className="text-xs font-bold tracking-wider text-gray-500 px-4 py-3 border-b-2 border-black">
              DAILY BREAKDOWN (raw)
            </h2>
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Day</th>
                  <th className="text-left px-4 py-2">Partner</th>
                  <th className="text-right px-4 py-2">Clicks</th>
                  <th className="text-right px-4 py-2">Unique jobs</th>
                  <th className="text-right px-4 py-2">Unique IPs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={`${r.partner}-${r.day}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2 tabular-nums">
                      {new Date(r.day).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-2">{r.partner}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.click_count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.unique_jobs}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.unique_ips}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && (
              <p className="text-xs text-gray-500 px-4 py-3">
                Showing first 100 of {rows.length.toLocaleString()} rows. Query the view
                directly for the full set.
              </p>
            )}
          </section>
        )}

        <footer className="mt-8 text-xs text-gray-500">
          <p>
            Data source: <code>partner_attribution_daily</code> view (rollup of{' '}
            <code>apply_clicks</code>). Refreshed live on every page load.
          </p>
          <p className="mt-1">
            Add partner attribution by handing publishers{' '}
            <code>freejobpost.co/jobs.xml?ref=&lt;partner&gt;</code>. Apply clicks from
            those URLs land here.
          </p>
        </footer>
      </div>
    </main>
  )
}

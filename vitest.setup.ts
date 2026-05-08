// Dummy env vars for vitest. Several lib modules (supabase.ts, turnstile.ts)
// read process.env at module-init time, which fails when tests run without
// .env.local loaded. Setting placeholder values here lets test files import
// modules that transitively initialize a Supabase client without crashing.
//
// IMPORTANT: never put real keys here. Tests that need to actually call
// Supabase or Turnstile should mock the network layer rather than relying
// on these placeholders.

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key-placeholder'
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||= '1x00000000000000000000AA'
process.env.TURNSTILE_SECRET_KEY ||= '1x0000000000000000000000000000000AA'
process.env.NEXT_PUBLIC_APP_URL ||= 'https://freejobpost.co'

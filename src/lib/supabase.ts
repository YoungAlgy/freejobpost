import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Single anon client shared across RSC renders.
// The custom fetch wrapper opts into Next's ISR cache — without it supabase-js
// sets no-store which forces every render dynamic. Per-page `export const
// revalidate` overrides the 300s default when a page needs fresher data.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        next: { revalidate: 300 },
      } as RequestInit)
    },
  },
})

'use server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function requestLoginLink(
  _prev: { success: boolean; error?: string } | null,
  input: { email: string }
): Promise<{ success: boolean; error?: string }> {
  const email = (input.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Enter a valid email.' }
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/employer-login-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { success: false, error: body.error || 'Login request failed. Try again.' }
    }
    return { success: true }
  } catch (e) {
    console.error('requestLoginLink error:', e instanceof Error ? e.message : 'unknown')
    return { success: false, error: 'Network error. Try again.' }
  }
}

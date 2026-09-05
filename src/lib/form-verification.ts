export type TurnstileStatus = 'pending' | 'ready' | 'failed' | 'expired'

/**
 * The shared widget intentionally reports an empty success token when no site
 * key is configured. A configured challenge, however, needs a real token.
 */
export function isTurnstileReady(isConfigured: boolean, token: string | null): boolean {
  return !isConfigured || (typeof token === 'string' && token.length > 0)
}

export function turnstileResultStatus(
  isConfigured: boolean,
  token: string,
): Extract<TurnstileStatus, 'ready' | 'failed'> {
  return isTurnstileReady(isConfigured, token) ? 'ready' : 'failed'
}

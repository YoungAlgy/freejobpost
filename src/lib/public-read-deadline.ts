export const PUBLIC_READ_TIMEOUT_MS = 15_000

/**
 * Bounds a read-only loader's database work. Every query in load must receive
 * the supplied signal. Await cancellation settlement instead of detaching I/O
 * with Promise.race. This is a client deadline, not a server statement timeout.
 */
export async function runPublicReadWithDeadline<T>(
  label: string,
  load: (signal: AbortSignal) => PromiseLike<T>,
  requestSignal?: AbortSignal,
  timeoutMs = PUBLIC_READ_TIMEOUT_MS,
): Promise<T> {
  if (requestSignal?.aborted) {
    throw requestSignal.reason ?? new DOMException('Request aborted', 'AbortError')
  }

  const controller = new AbortController()
  let timedOut = false
  let requestAborted = false
  const abortFromRequest = () => {
    requestAborted = true
    clearTimeout(timeoutId)
    // PostgREST recognizes AbortError and will not retry it. Keep that default
    // reason even when the incoming request used TimeoutError or a custom one.
    controller.abort()
  }
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  requestSignal?.addEventListener('abort', abortFromRequest, { once: true })

  const throwIfCanceled = () => {
    if (timedOut) throw new Error(`${label} timed out after ${timeoutMs}ms`)
    if (requestAborted) {
      throw requestSignal?.reason ?? new DOMException('Request aborted', 'AbortError')
    }
  }

  try {
    const value = await load(controller.signal)
    // Supabase resolves most transport errors as { error }, and optional reads
    // may swallow those. Cancellation must never become a successful response.
    throwIfCanceled()
    return value
  } catch (error) {
    throwIfCanceled()
    throw error
  } finally {
    clearTimeout(timeoutId)
    requestSignal?.removeEventListener('abort', abortFromRequest)
  }
}

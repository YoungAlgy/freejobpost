import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { PUBLIC_READ_TIMEOUT_MS, runPublicReadWithDeadline } from './public-read-deadline'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('runPublicReadWithDeadline', () => {
  it('returns a successful result and removes its timer and listener', async () => {
    vi.useFakeTimers()
    const request = new AbortController()
    const remove = vi.spyOn(request.signal, 'removeEventListener')
    const result = await runPublicReadWithDeadline('feed', async () => 42, request.signal)
    expect(result).toBe(42)
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('preserves loader failures and cleans up', async () => {
    vi.useFakeTimers()
    const failure = new Error('read failed')
    await expect(runPublicReadWithDeadline('feed', async () => { throw failure }))
      .rejects.toBe(failure)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start the loader for an already canceled request', async () => {
    vi.useFakeTimers()
    const request = new AbortController()
    const reason = new Error('client left')
    request.abort(reason)
    const load = vi.fn(async () => [])
    await expect(runPublicReadWithDeadline('feed', load, request.signal)).rejects.toBe(reason)
    expect(load).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts at the shared deadline but waits for the loader to settle', async () => {
    vi.useFakeTimers()
    let settled = false
    let signalSeen: AbortSignal | undefined
    const result = runPublicReadWithDeadline('feed', (signal) => {
      signalSeen = signal
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          setTimeout(() => {
            settled = true
            reject(signal.reason)
          }, 25)
        }, { once: true })
      })
    })
    const assertion = expect(result).rejects.toThrow(`feed timed out after ${PUBLIC_READ_TIMEOUT_MS}ms`)
    await vi.advanceTimersByTimeAsync(PUBLIC_READ_TIMEOUT_MS)
    expect(signalSeen?.aborted).toBe(true)
    expect(signalSeen?.reason.name).toBe('AbortError')
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(25)
    await assertion
    expect(settled).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cannot turn swallowed cancellation into valid empty inventory', async () => {
    vi.useFakeTimers()
    const result = runPublicReadWithDeadline('feed', (signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => resolve([]), { once: true })
    }), undefined, 100)
    const assertion = expect(result).rejects.toThrow('feed timed out after 100ms')
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })

  it('normalizes caller cancellation for PostgREST and preserves its original reason', async () => {
    vi.useFakeTimers()
    const request = new AbortController()
    const reason = new DOMException('caller deadline', 'TimeoutError')
    let normalizedReason: unknown
    const result = runPublicReadWithDeadline('feed', (signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => {
        normalizedReason = signal.reason
        resolve([])
      }, { once: true })
    }), request.signal)
    const assertion = expect(result).rejects.toBe(reason)
    request.abort(reason)
    await assertion
    expect(normalizedReason).toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not retry a PostgREST fetch that is pending when aborted', async () => {
    vi.useFakeTimers()
    // All I/O stays in this mock. No app environment or live service is used.
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (signal?.aborted) reject(signal.reason)
        else signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      }))
    const client = createClient('https://unit-test.invalid', 'unit-test-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchMock },
    })
    const result = runPublicReadWithDeadline('feed', async (signal) => {
      return await client.from('public_jobs').select('id').abortSignal(signal)
    }, undefined, 100)
    const assertion = expect(result).rejects.toThrow('feed timed out after 100ms')
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([503, 520, 'network'])('makes only one attempt when a contained read fails with %s', async (failure) => {
    const fetchMock = vi.fn(async () => {
      if (failure === 'network') throw new TypeError('connection failed')
      return new Response('upstream unavailable', { status: failure as number })
    })
    const client = createClient('https://unit-test.invalid', 'unit-test-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchMock },
    })
    const result = await runPublicReadWithDeadline('feed', async (signal) => {
      // Production feed and job loaders explicitly disable retries. AbortError
      // alone does not cover failures that enter the client's retry backoff.
      return await client.from('public_jobs').select('id').abortSignal(signal).retry(false)
    })
    expect(result.error).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

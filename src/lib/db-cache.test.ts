import type { SupabaseClient } from '@supabase/supabase-js'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DB_CACHE_WRITE_TIMEOUT_MS, getOrComputeCached } from '@/lib/db-cache'

type RpcResult = {
  data: unknown
  error: { message: string } | null
}

type AbortableRpcPromise = Promise<RpcResult> & {
  abortSignal: (signal: AbortSignal) => AbortableRpcPromise
}

function abortableRpc(
  promise: Promise<RpcResult>,
  abortDelayMs = 0,
): AbortableRpcPromise {
  const query = promise as AbortableRpcPromise
  query.abortSignal = (signal) => {
    const aborted = new Promise<RpcResult>((_, reject) => {
      const rejectAbort = () => {
        const rejectRequest = () => reject(new DOMException('Request aborted', 'AbortError'))
        if (abortDelayMs > 0) setTimeout(rejectRequest, abortDelayMs)
        else rejectRequest()
      }
      if (signal.aborted) rejectAbort()
      else signal.addEventListener('abort', rejectAbort, { once: true })
    })
    return abortableRpc(Promise.race([promise, aborted]), abortDelayMs)
  }
  return query
}

function fakeClient(
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>,
  abortDelayMs = 0,
): { db: SupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpcSpy = vi.fn((name: string, args: Record<string, unknown>) =>
    abortableRpc(rpc(name, args), abortDelayMs),
  )
  return {
    db: { rpc: rpcSpy } as unknown as SupabaseClient,
    rpc: rpcSpy,
  }
}

describe('getOrComputeCached', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns a cached value without computing or writing', async () => {
    const { db, rpc } = fakeClient(async () => ({
      data: [{ slug: 'cached' }],
      error: null,
    }))
    const compute = vi.fn(async () => [{ slug: 'fresh' }])

    await expect(getOrComputeCached(db, 'matrix', 3600, compute)).resolves.toEqual([
      { slug: 'cached' },
    ])
    expect(compute).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_matrix_cache', {
      p_key: 'matrix',
      p_max_age_seconds: 3600,
    })
  })

  it('treats a cached empty array as a miss and recomputes it', async () => {
    const { db, rpc } = fakeClient(async (name) =>
      name === 'get_matrix_cache'
        ? { data: [], error: null }
        : { data: null, error: null },
    )
    const compute = vi.fn(async () => [{ slug: 'fresh' }])

    await expect(getOrComputeCached(db, 'matrix', 3600, compute)).resolves.toEqual([
      { slug: 'fresh' },
    ])
    expect(compute).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenLastCalledWith('set_matrix_cache', {
      p_key: 'matrix',
      p_value: [{ slug: 'fresh' }],
    })
  })

  it('passes a caller abort signal into the cache read', async () => {
    const controller = new AbortController()
    const { db } = fakeClient(async () => new Promise<RpcResult>(() => undefined))
    const compute = vi.fn(async () => [{ slug: 'fresh' }])
    const resultPromise = getOrComputeCached(db, 'matrix', 3600, compute, {
      signal: controller.signal,
    })

    controller.abort()

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' })
    expect(compute).not.toHaveBeenCalled()
  })

  it('awaits the cache write before resolving a fresh value', async () => {
    let resolveWrite: (result: RpcResult) => void = () => undefined
    const pendingWrite = new Promise<RpcResult>((resolve) => {
      resolveWrite = resolve
    })
    const { db, rpc } = fakeClient(async (name) => {
      if (name === 'get_matrix_cache') return { data: null, error: null }
      return pendingWrite
    })

    let settled = false
    const resultPromise = getOrComputeCached(db, 'matrix', 3600, async () => [
      { slug: 'fresh' },
    ]).then((result) => {
      settled = true
      return result
    })

    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))
    expect(settled).toBe(false)
    resolveWrite({ data: null, error: null })

    await expect(resultPromise).resolves.toEqual([{ slug: 'fresh' }])
    expect(rpc).toHaveBeenLastCalledWith('set_matrix_cache', {
      p_key: 'matrix',
      p_value: [{ slug: 'fresh' }],
    })
  })

  it('keeps a fresh value when the cache write returns an error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db } = fakeClient(async (name) =>
      name === 'get_matrix_cache'
        ? { data: null, error: null }
        : { data: null, error: { message: 'write failed' } },
    )

    try {
      await expect(
        getOrComputeCached(db, 'matrix', 3600, async () => ({ value: 'fresh' })),
      ).resolves.toEqual({ value: 'fresh' })
      expect(errorSpy).toHaveBeenCalledWith(
        '[db-cache] set_matrix_cache(matrix) failed:',
        'write failed',
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('keeps a fresh value when the cache write rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const writeFailure = new Error('connection dropped')
    const { db } = fakeClient(async (name) => {
      if (name === 'get_matrix_cache') return { data: null, error: null }
      throw writeFailure
    })

    try {
      await expect(
        getOrComputeCached(db, 'matrix', 3600, async () => ({ value: 'fresh' })),
      ).resolves.toEqual({ value: 'fresh' })
      expect(errorSpy).toHaveBeenCalledWith(
        '[db-cache] set_matrix_cache(matrix) threw:',
        writeFailure,
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('aborts a cache write at the deadline and still returns fresh data', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db, rpc } = fakeClient(async (name) => {
      if (name === 'get_matrix_cache') return { data: null, error: null }
      return new Promise<RpcResult>(() => undefined)
    })

    try {
      const resultPromise = getOrComputeCached(db, 'matrix', 3600, async () => ({
        value: 'fresh',
      }))
      await vi.advanceTimersByTimeAsync(0)
      expect(rpc).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(DB_CACHE_WRITE_TIMEOUT_MS)
      await expect(resultPromise).resolves.toEqual({ value: 'fresh' })
      expect(errorSpy).toHaveBeenCalledWith(
        `[db-cache] set_matrix_cache(matrix) timed out after ${DB_CACHE_WRITE_TIMEOUT_MS}ms`,
      )
    } finally {
      errorSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('waits for the aborted cache write to settle before returning fresh data', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db } = fakeClient(async (name) => {
      if (name === 'get_matrix_cache') return { data: null, error: null }
      return new Promise<RpcResult>(() => undefined)
    }, 25)
    let settled = false

    try {
      const resultPromise = getOrComputeCached(db, 'matrix', 3600, async () => ({
        value: 'fresh',
      })).then((result) => {
        settled = true
        return result
      })

      await vi.advanceTimersByTimeAsync(DB_CACHE_WRITE_TIMEOUT_MS)
      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(25)
      await expect(resultPromise).resolves.toEqual({ value: 'fresh' })
      expect(settled).toBe(true)
      expect(errorSpy).toHaveBeenCalledWith(
        `[db-cache] set_matrix_cache(matrix) timed out after ${DB_CACHE_WRITE_TIMEOUT_MS}ms`,
      )
    } finally {
      errorSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('does not cache an empty array fallback', async () => {
    const { db, rpc } = fakeClient(async () => ({ data: null, error: null }))

    await expect(getOrComputeCached(db, 'matrix', 3600, async () => [])).resolves.toEqual([])
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('never writes a fresh value during a Next production build', async () => {
    vi.stubEnv('NEXT_PHASE', PHASE_PRODUCTION_BUILD)
    const { db, rpc } = fakeClient(async () => ({ data: null, error: null }))
    const compute = vi.fn(async () => [{ slug: 'fresh' }])

    await expect(getOrComputeCached(db, 'matrix', 3600, compute)).resolves.toEqual([
      { slug: 'fresh' },
    ])
    expect(compute).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_matrix_cache', {
      p_key: 'matrix',
      p_max_age_seconds: 3600,
    })
    expect(rpc).not.toHaveBeenCalledWith('set_matrix_cache', expect.anything())
  })

  it('never writes when the sanitized OpenNext release marker is set', async () => {
    vi.stubEnv('FREEJOBPOST_RELEASE_BUILD', '1')
    const { db, rpc } = fakeClient(async () => ({ data: null, error: null }))
    const compute = vi.fn(async () => [{ slug: 'fresh' }])

    await expect(getOrComputeCached(db, 'matrix', 3600, compute)).resolves.toEqual([
      { slug: 'fresh' },
    ])
    expect(compute).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_matrix_cache', {
      p_key: 'matrix',
      p_max_age_seconds: 3600,
    })
    expect(rpc).not.toHaveBeenCalledWith('set_matrix_cache', expect.anything())
  })
})

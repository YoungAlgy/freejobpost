import { describe, expect, it, vi } from 'vitest'
import {
  activeJobBatchCount,
  BATCH_CONCURRENCY,
  runBatchesConcurrencyCapped,
} from './active-batch-count'

function fakeCountClient(result: { count: number | null; error: { message: string } | null }) {
  const query: Record<string, unknown> = {}
  for (const name of [
    'select', 'eq', 'not', 'is', 'gt', 'retry', 'abortSignal',
  ]) {
    query[name] = () => query
  }
  query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
  return { from: () => query } as never
}

describe('activeJobBatchCount', () => {
  it('preserves one batch plus headroom for a valid zero count', async () => {
    await expect(activeJobBatchCount(fakeCountClient({ count: 0, error: null }))).resolves.toBe(1)
  })

  it.each([null, Number.NaN, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid count %s before callers can schedule fallback range reads',
    async (count) => {
      await expect(
        activeJobBatchCount(fakeCountClient({ count, error: null })),
      ).rejects.toThrow('active job count failed with an invalid result')
    },
  )

  it('rejects a count query error before callers can schedule fallback range reads', async () => {
    await expect(
      activeJobBatchCount(fakeCountClient({ count: null, error: { message: 'database unavailable' } })),
    ).rejects.toThrow('active job count failed: database unavailable')
  })
})

describe('runBatchesConcurrencyCapped', () => {
  it('keeps the configured in-flight cap', async () => {
    let inFlight = 0
    let peak = 0
    const result = await runBatchesConcurrencyCapped(BATCH_CONCURRENCY * 2 + 1, async (index) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight--
      return { index, error: null }
    })

    expect(result).toHaveLength(BATCH_CONCURRENCY * 2 + 1)
    expect(peak).toBeLessThanOrEqual(BATCH_CONCURRENCY)
  })

  it('does not schedule a later wave after a settled PostgREST error', async () => {
    const runBatch = vi.fn(async (index: number) => ({
      index,
      error: index === 2 ? { message: 'database unavailable' } : null,
    }))

    const result = await runBatchesConcurrencyCapped(BATCH_CONCURRENCY * 2, runBatch)

    expect(result).toHaveLength(BATCH_CONCURRENCY)
    expect(runBatch).toHaveBeenCalledTimes(BATCH_CONCURRENCY)
  })

  it('waits for every started request to settle before surfacing a rejection', async () => {
    let releaseSecond!: () => void
    const second = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })
    const runBatch = vi.fn((index: number) => {
      if (index === 0) return Promise.reject(new Error('transport failed'))
      return second.then(() => ({ index, error: null }))
    })

    const result = runBatchesConcurrencyCapped(2, runBatch)
    await Promise.resolve()
    let settled = false
    void result.catch(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseSecond()
    await expect(result).rejects.toThrow('transport failed')
  })

  it('waits for a started request when a sibling callback throws synchronously', async () => {
    let releaseFirst!: () => void
    const first = new Promise<{ index: number; error: null }>((resolve) => {
      releaseFirst = () => resolve({ index: 0, error: null })
    })
    const runBatch = vi.fn((index: number) => {
      if (index === 0) return first
      throw new Error('synchronous transport setup failure')
    })

    const result = runBatchesConcurrencyCapped(2, runBatch)
    await Promise.resolve()
    let settled = false
    void result.catch(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseFirst()
    await expect(result).rejects.toThrow('synchronous transport setup failure')
  })

  it('handles nullish successful results without error inspection failures', async () => {
    await expect(
      runBatchesConcurrencyCapped(2, async (index) => (index === 0 ? null : undefined)),
    ).resolves.toEqual([null, undefined])
  })
})

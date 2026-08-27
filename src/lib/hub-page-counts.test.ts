import { describe, expect, it, vi } from 'vitest'
import { runCountTasksSettled } from '@/lib/hub-page-counts'

describe('runCountTasksSettled', () => {
  it('waits for every started request to settle before propagating an abort failure', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let started = 0
    let requestSettled = 0
    let runnerSettled = false

    const abortingTask = (label: string, settleDelayMs: number) => () =>
      new Promise<number>((_resolve, reject) => {
        started++
        const rejectAfterAbort = () => {
          setTimeout(() => {
            requestSettled++
            reject(new DOMException(`${label} aborted`, 'AbortError'))
          }, settleDelayMs)
        }
        if (controller.signal.aborted) rejectAfterAbort()
        else controller.signal.addEventListener('abort', rejectAfterAbort, { once: true })
      })

    try {
      const resultPromise = runCountTasksSettled(
        [
          abortingTask('first', 10),
          abortingTask('second', 30),
          abortingTask('unstarted', 1),
        ],
        2,
      )
      const tracked = resultPromise.then(
        () => {
          runnerSettled = true
        },
        () => {
          runnerSettled = true
        },
      )
      const assertion = expect(resultPromise).rejects.toThrow('first aborted')

      await vi.advanceTimersByTimeAsync(0)
      expect(started).toBe(2)
      controller.abort()

      await vi.advanceTimersByTimeAsync(10)
      expect(requestSettled).toBe(1)
      expect(runnerSettled).toBe(false)

      await vi.advanceTimersByTimeAsync(20)
      await assertion
      await tracked
      expect(requestSettled).toBe(2)
      expect(runnerSettled).toBe(true)
      expect(started).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

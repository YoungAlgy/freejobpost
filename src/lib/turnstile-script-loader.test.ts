import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTurnstileScriptLoader,
  reportCurrentTurnstileLoadFailure,
} from './turnstile-script-loader'

class FakeScript {
  removed = false
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener)
  }

  remove() {
    this.removed = true
  }

  emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      if (typeof listener === 'function') listener(new Event(type))
      else listener.handleEvent(new Event(type))
    }
  }
}

function harness(existing: FakeScript[] = []) {
  let ready = false
  const scripts = [...existing]
  const loader = createTurnstileScriptLoader({
    isReady: () => ready,
    findExistingScript: () => scripts.find((script) => !script.removed) ?? null,
    createAndAppendScript: () => {
      const script = new FakeScript()
      scripts.push(script)
      return script
    },
  })
  return {
    loader,
    scripts,
    setReady(value: boolean) {
      ready = value
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Turnstile script loader', () => {
  it('shares one script request across concurrent mounts', async () => {
    const page = harness()
    const first = page.loader()
    const second = page.loader()

    expect(second).toBe(first)
    expect(page.scripts).toHaveLength(1)
    page.setReady(true)
    page.scripts[0].emit('load')
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
  })

  it('removes only its failed script and creates a fresh retry request', async () => {
    const page = harness()
    const first = page.loader()
    page.scripts[0].emit('error')
    await expect(first).rejects.toThrow('failed to load')
    expect(page.scripts[0].removed).toBe(true)

    const retry = page.loader()
    expect(page.scripts).toHaveLength(2)
    expect(page.scripts[1]).not.toBe(page.scripts[0])
    page.setReady(true)
    page.scripts[1].emit('load')
    await expect(retry).resolves.toBeUndefined()
  })

  it('preserves a failed external script while retrying with one owned script', async () => {
    const external = new FakeScript()
    const page = harness([external])
    const first = page.loader()
    external.emit('error')
    await expect(first).rejects.toThrow('failed to load')
    expect(external.removed).toBe(false)

    const retry = page.loader()
    expect(page.scripts).toHaveLength(2)
    expect(external.removed).toBe(false)
    page.setReady(true)
    page.scripts[1].emit('load')
    await expect(retry).resolves.toBeUndefined()
  })

  it('clears timeout polling and permits a new request', async () => {
    vi.useFakeTimers()
    const page = harness()
    const first = page.loader()
    const failed = expect(first).rejects.toThrow('failed to load')

    await vi.advanceTimersByTimeAsync(8_000)
    await failed
    expect(vi.getTimerCount()).toBe(0)
    expect(page.scripts[0].removed).toBe(true)

    void page.loader()
    expect(page.scripts).toHaveLength(2)
  })

  it('suppresses a cancelled mount failure before a retry succeeds', async () => {
    const page = harness()
    let cancelled = false
    const staleFailure = vi.fn()
    const first = page.loader().catch(() => {
      reportCurrentTurnstileLoadFailure(cancelled, staleFailure)
    })
    cancelled = true
    page.scripts[0].emit('error')
    await first

    const retry = page.loader()
    page.setReady(true)
    page.scripts[1].emit('load')
    await retry
    expect(staleFailure).not.toHaveBeenCalled()
  })

  it('reports current failures and preserves the no-config component branch', () => {
    const stale = vi.fn()
    const current = vi.fn()
    reportCurrentTurnstileLoadFailure(true, stale)
    reportCurrentTurnstileLoadFailure(false, current)
    expect(stale).not.toHaveBeenCalled()
    expect(current).toHaveBeenCalledOnce()

    const widget = readFileSync(
      resolve(process.cwd(), 'src/components/TurnstileWidget.tsx'),
      'utf8',
    )
    const effect = widget.indexOf('useEffect(() => {')
    const noConfig = widget.indexOf('if (!sitekey)', effect)
    const failOpen = widget.indexOf("onSuccess('')", noConfig)
    const loader = widget.indexOf('whenTurnstileReady()', effect)
    expect(noConfig).toBeGreaterThan(effect)
    expect(failOpen).toBeGreaterThan(noConfig)
    expect(loader).toBeGreaterThan(failOpen)
    expect(widget).toContain('reportCurrentTurnstileLoadFailure(cancelled')
  })
})

export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type ScriptHandle = {
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => void
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) => void
  remove: () => void
}

type TimerHandle = ReturnType<typeof setTimeout>

export type TurnstileScriptLoaderDependencies = {
  isReady: () => boolean
  findExistingScript: () => ScriptHandle | null
  createAndAppendScript: () => ScriptHandle
  now?: () => number
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle
  clearTimer?: (timer: TimerHandle) => void
}

export function createTurnstileScriptLoader(
  dependencies: TurnstileScriptLoaderDependencies,
) {
  const failedScripts = new WeakSet<ScriptHandle>()
  const ownedScripts = new WeakSet<ScriptHandle>()
  const now = dependencies.now ?? Date.now
  const setTimer = dependencies.setTimer ?? setTimeout
  const clearTimer = dependencies.clearTimer ?? clearTimeout
  let inFlight: Promise<void> | null = null

  return function whenReady(): Promise<void> {
    if (dependencies.isReady()) return Promise.resolve()
    if (inFlight) return inFlight

    let observedScript: ScriptHandle | null = null
    const attempt = new Promise<void>((resolve, reject) => {
      const start = now()
      let settled = false
      let timer: TimerHandle | undefined

      const cleanup = () => {
        if (!observedScript) return
        observedScript.removeEventListener('load', checkReady)
        observedScript.removeEventListener('error', fail)
        if (timer !== undefined) {
          clearTimer(timer)
          timer = undefined
        }
      }
      const succeed = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const fail = () => {
        if (settled || !observedScript) return
        settled = true
        failedScripts.add(observedScript)
        cleanup()
        reject(new Error('Turnstile script failed to load'))
      }
      const scheduleCheck = () => {
        if (timer !== undefined) return
        timer = setTimer(() => {
          timer = undefined
          checkReady()
        }, 100)
      }
      function checkReady() {
        if (settled) return
        if (dependencies.isReady()) {
          succeed()
          return
        }
        if (now() - start >= 8_000) {
          fail()
          return
        }
        scheduleCheck()
      }

      const existing = dependencies.findExistingScript()
      if (existing && !failedScripts.has(existing)) {
        observedScript = existing
      } else {
        observedScript = dependencies.createAndAppendScript()
        ownedScripts.add(observedScript)
      }
      observedScript.addEventListener('load', checkReady, { once: true })
      observedScript.addEventListener('error', fail, { once: true })
      checkReady()
    })

    const shared = attempt
      .catch((error) => {
        if (
          observedScript &&
          failedScripts.has(observedScript) &&
          ownedScripts.has(observedScript) &&
          !dependencies.isReady()
        ) {
          observedScript.remove()
        }
        throw error
      })
      .finally(() => {
        if (inFlight === shared) inFlight = null
      })
    inFlight = shared
    return shared
  }
}

export function reportCurrentTurnstileLoadFailure(
  cancelled: boolean,
  report: () => void,
) {
  if (cancelled) return
  report()
}

/**
 * In-memory map of tool calls that are waiting for a page submission.
 *
 * The spike keeps this deliberately small: one promise per `callId`, first
 * answer wins, cancellation rejects, and a wait that runs out resolves as
 * unanswered so the agent can continue instead of hanging the turn.
 */

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

/** A page submission that reached the waiting call. */
export interface WaitAnswer {
  answered: true
  summary: string
  data: unknown
}

/** The wait expired before any page submitted. */
export interface WaitTimeout {
  answered: false
  reason: 'timeout'
}

/** What a wait settles to; the tool returns this to the model. */
export type WaitResult = WaitAnswer | WaitTimeout

/** Per-call wait options. */
export interface WaitOptions {
  /** Caller cancellation; aborting rejects the wait with `ABORTED`. */
  signal?: AbortSignal
  /** Deadline in milliseconds; zero or less waits forever. */
  timeoutMs?: number
}

/** A submission the registry could not deliver. */
export interface NotWaiting {
  ok: false
  code: 'not-waiting'
}

/** A submission the registry delivered to its call. */
export interface Delivered {
  ok: true
}

/** The waiting map's public surface. */
export interface WaitRegistry {
  /** Start waiting for one call. */
  create(callId: string, options?: WaitOptions): Promise<WaitResult>
  /** Deliver one page submission; the first answer for a call wins. */
  answer(callId: string, answer: { summary: string; data: unknown }): Delivered | NotWaiting
  /** Number of calls currently waiting. */
  readonly size: number
}

/** Cancellation error carrying the code callers branch on. */
export interface AbortError extends Error {
  code: 'ABORTED'
}

interface WaitEntry {
  resolve: (value: WaitResult) => void
  reject: (error: Error) => void
  settled: boolean
  timer: ReturnType<typeof setTimeout> | null
  signal?: AbortSignal
  onAbort?: () => void
}

function abortError(): AbortError {
  const error = new Error('the render call was cancelled') as AbortError
  error.code = 'ABORTED'
  return error
}

export function createWaitRegistry({
  defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
}: { defaultTimeoutMs?: number } = {}): WaitRegistry {
  const pending = new Map<string, WaitEntry>()

  /** Drop every resource the entry owns; the caller settles it afterwards. */
  function dispose(callId: string, entry: WaitEntry): void {
    entry.settled = true
    pending.delete(callId)
    if (entry.timer !== null) clearTimeout(entry.timer)
    if (entry.onAbort !== undefined && entry.signal !== undefined) {
      entry.signal.removeEventListener('abort', entry.onAbort)
    }
  }

  function settle(callId: string, entry: WaitEntry, value: WaitResult): boolean {
    if (entry.settled) return false
    dispose(callId, entry)
    entry.resolve(value)
    return true
  }

  function fail(callId: string, entry: WaitEntry, error: Error): boolean {
    if (entry.settled) return false
    dispose(callId, entry)
    entry.reject(error)
    return true
  }

  return {
    create(callId, options = {}) {
      if (pending.has(callId)) throw new Error(`a wait for ${callId} already exists`)

      const { signal, timeoutMs = defaultTimeoutMs } = options
      let resolve!: (value: WaitResult) => void
      let reject!: (error: Error) => void
      const promise = new Promise<WaitResult>((res, rej) => {
        resolve = res
        reject = rej
      })
      const entry: WaitEntry = { resolve, reject, settled: false, timer: null, signal }
      pending.set(callId, entry)

      if (signal !== undefined && signal.aborted) {
        fail(callId, entry, abortError())
        return promise
      }

      if (signal !== undefined) {
        entry.onAbort = () => fail(callId, entry, abortError())
        signal.addEventListener('abort', entry.onAbort, { once: true })
      }

      if (timeoutMs > 0) {
        entry.timer = setTimeout(
          () => settle(callId, entry, { answered: false, reason: 'timeout' }),
          timeoutMs,
        )
      }

      return promise
    },

    answer(callId, answer) {
      const entry = pending.get(callId)
      if (entry === undefined) return { ok: false, code: 'not-waiting' }
      settle(callId, entry, { answered: true, summary: answer.summary, data: answer.data })
      return { ok: true }
    },

    get size() {
      return pending.size
    },
  }
}

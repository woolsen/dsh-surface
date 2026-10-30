/**
 * In-memory map of tool calls that are waiting for a page submission.
 *
 * The spike keeps this deliberately small: one promise per `callId`, first
 * answer wins, cancellation rejects, and a wait that runs out resolves as
 * unanswered so the agent can continue instead of hanging the turn.
 */

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

export function createWaitRegistry({ defaultTimeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  /** @type {Map<string, { resolve: Function, reject: Function, settled: boolean, timer: any, onAbort?: Function, signal?: AbortSignal }>} */
  const pending = new Map()

  function settle(callId, entry, value) {
    if (entry.settled) return false
    entry.settled = true
    pending.delete(callId)
    if (entry.timer !== null) clearTimeout(entry.timer)
    if (entry.onAbort !== undefined && entry.signal !== undefined) {
      entry.signal.removeEventListener('abort', entry.onAbort)
    }
    entry.resolve(value)
    return true
  }

  function fail(callId, entry, error) {
    if (entry.settled) return false
    entry.settled = true
    pending.delete(callId)
    if (entry.timer !== null) clearTimeout(entry.timer)
    if (entry.onAbort !== undefined && entry.signal !== undefined) {
      entry.signal.removeEventListener('abort', entry.onAbort)
    }
    entry.reject(error)
    return true
  }

  return {
    /**
     * Start waiting for one call.
     * @param {string} callId
     * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
     * @returns {Promise<{ answered: true, summary: string, data: unknown } | { answered: false, reason: 'timeout' }>}
     */
    create(callId, options = {}) {
      if (pending.has(callId)) throw new Error(`a wait for ${callId} already exists`)

      const { signal, timeoutMs = defaultTimeoutMs } = options
      let resolve
      let reject
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      const entry = { resolve, reject, settled: false, timer: null, signal }
      pending.set(callId, entry)

      if (signal !== undefined && signal.aborted) {
        const error = new Error('the render call was cancelled')
        error.code = 'ABORTED'
        fail(callId, entry, error)
        return promise
      }

      if (signal !== undefined) {
        entry.onAbort = () => {
          const error = new Error('the render call was cancelled')
          error.code = 'ABORTED'
          fail(callId, entry, error)
        }
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

    /**
     * Deliver one page submission.
     * @param {string} callId
     * @param {{ summary: string, data: unknown }} answer
     * @returns {{ ok: true } | { ok: false, code: 'not-waiting' }}
     */
    answer(callId, answer) {
      const entry = pending.get(callId)
      if (entry === undefined) return { ok: false, code: 'not-waiting' }
      settle(callId, entry, { answered: true, summary: answer.summary, data: answer.data })
      return { ok: true }
    },

    /** Number of calls currently waiting. */
    get size() {
      return pending.size
    },
  }
}

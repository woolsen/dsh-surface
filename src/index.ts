import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ANSWER_PATH, handleAnswerRequest } from './answer.ts'
import { createWaitRegistry } from './wait.ts'

/** Plugin display name, for diagnostics only. */
export const name = 'dsh-surface'

/** The tool registry is the only hard dependency; the web route is optional. */
export const inject = ['tools']

const MAX_HTML_BYTES = 200_000
const MAX_TITLE_CHARS = 120
const DEFAULT_TIMEOUT_SECONDS = 600
const MAX_TIMEOUT_SECONDS = 3600

/** Plugin config: the deadline a `render` call gets when it asks for none. */
export interface SurfaceConfig {
  defaultTimeoutSeconds?: number
}

/**
 * The host's authenticated `/api` route table, provided by the web carrier's
 * `connection` service. Declared locally because this plugin must also load on
 * a headless host that provides no connection at all.
 */
interface FetchRoute {
  path: string
  methods: string[]
  requestBody: 'buffered'
  fetch: (request: Request) => Response | Promise<Response>
}

interface FetchRoutes {
  /** Register one route; returns the disposer that removes it again. */
  register(route: FetchRoute): () => void
}

interface ConnectionLike {
  fetch?: FetchRoutes
}

/** A crude title for the call card; the page's own <title> stays authoritative. */
function titleOf(args: { title?: string }): string {
  if (typeof args?.title === 'string' && args.title.trim() !== '') return args.title.trim()
  return 'Interactive page'
}

export function apply(ctx: Context, config: SurfaceConfig = {}): void {
  const configuredTimeout = config.defaultTimeoutSeconds
  const defaultTimeoutSeconds =
    typeof configuredTimeout === 'number' && Number.isFinite(configuredTimeout)
      ? configuredTimeout
      : DEFAULT_TIMEOUT_SECONDS
  const waits = createWaitRegistry({ defaultTimeoutMs: defaultTimeoutSeconds * 1000 })

  ctx.tools.register(
    defineTool({
      name: 'render',
      description:
        'Show a self-contained HTML page inline in the conversation and wait for the user to submit it. Use it when a decision, configuration, selection, or short form is easier to operate than to describe. The call blocks until the page calls dshSurface.submit(data, summary), the user cancels, or the wait times out. Keep the page self-contained: no network requests, no external scripts or stylesheets. Provide a complete HTML document and make every control that finishes the task call dshSurface.submit(data, summary) with a short summary and a JSON-serializable data object. The tool returns {"answered":true,"summary","data"} or {"answered":false,"reason":"timeout"}.',
      parameters: {
        html: {
          type: 'string',
          required: true,
          description:
            'A complete, self-contained HTML document. Inline CSS and JS only; no network requests, external assets, or top-level navigation. Call dshSurface.submit(data, summary) from a click handler to finish.',
        },
        title: {
          type: 'string',
          description: 'Short title shown on the tool card and used to name the page when it has no <title>.',
        },
        timeoutSeconds: {
          type: 'number',
          description:
            'How long to wait for the submission. Defaults to 600 seconds; use a positive value. When it expires the call returns answered:false so the agent can continue.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      presentCall: (args) => ({ card: 'generic', title: `Page · ${titleOf(args)}` }),
      async execute(args, exec) {
        const html = typeof args?.html === 'string' ? args.html : ''
        if (html.trim() === '') throw new Error('render needs a non-empty html document')
        if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) {
          throw new Error(
            `render html is longer than ${MAX_HTML_BYTES} bytes; split the page or inline less data`,
          )
        }
        if (typeof args?.title === 'string' && args.title.length > MAX_TITLE_CHARS) {
          throw new Error(`render title is longer than ${MAX_TITLE_CHARS} characters`)
        }

        const requested = Number(args?.timeoutSeconds)
        const timeoutMs =
          Number.isFinite(requested) && requested > 0
            ? Math.min(requested, MAX_TIMEOUT_SECONDS) * 1000
            : defaultTimeoutSeconds * 1000

        const result = await waits.create(exec.callId, { signal: exec.signal, timeoutMs })
        return JSON.stringify(result)
      },
    }),
  )

  // The answer route lives on the host's authenticated /api channel. A host
  // without the web carrier (headless/TUI) simply has no page to submit, and
  // the tool falls back to its timeout.
  ctx.inject(['connection'], (scope) => {
    const connection = scope.get('connection') as ConnectionLike | undefined
    const fetchRoutes = connection?.fetch
    if (fetchRoutes === undefined || typeof fetchRoutes.register !== 'function') return

    scope.effect(
      () =>
        fetchRoutes.register({
          path: ANSWER_PATH,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: (request) => handleAnswerRequest(waits, request),
        }),
      'dsh-surface: answer route',
    )
  })
}

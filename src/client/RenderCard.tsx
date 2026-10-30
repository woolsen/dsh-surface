import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { HEIGHT_MESSAGE, RESULT_MESSAGE, SUBMIT_MESSAGE, buildPageDoc, titleOfPage } from './shell'
import { readHostTheme } from './theme'

const ANSWER_PATH = '/api/dsh-surface/answer'
const MAX_DATA_BYTES = 16_000
const MAX_SUMMARY_CHARS = 500
const MIN_HEIGHT = 120
const MAX_HEIGHT = 1400

type Status = 'waiting' | 'submitting' | 'sent' | 'error'

export interface RenderCardProps {
  callId: string
  phase?: 'preparing' | 'start' | 'result'
  block: any
}

/** The recorded call arguments, when the stream has produced complete JSON. */
function readArgs(block: any): any | null {
  const raw = block && typeof block === 'object' && 'kind' in block ? block.call?.argsRaw : block?.argsRaw
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function readResult(block: any): any | null {
  if (!block || typeof block !== 'object' || !('kind' in block)) return null
  const content = Array.isArray(block.content) ? block.content : []
  const text = content.find((part: any) => part?.type === 'text' && typeof part.text === 'string')?.text
  if (typeof text !== 'string' || text.trim() === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Re-render when the host flips its theme; the frame document is rebuilt from tokens. */
function useThemeTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((value) => value + 1)
    const observer = new MutationObserver(bump)
    observer.observe(document.documentElement, { attributes: true })
    if (document.body) observer.observe(document.body, { attributes: true })
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', bump)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', bump)
    }
  }, [])
  return tick
}

const cardStyle: CSSProperties = {
  minWidth: 0,
  maxWidth: '100%',
  margin: '4px 0 2px',
}

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 20,
  marginTop: 4,
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 11,
  lineHeight: '16px',
}

const dotStyle = (color: string): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: 3,
  background: color,
  flex: 'none',
})

export function RenderCard({ callId, phase, block }: RenderCardProps) {
  const args = useMemo(() => readArgs(block), [block])
  const recorded = useMemo(() => readResult(block), [block])
  const themeTick = useThemeTick()
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [height, setHeight] = useState(160)
  const [status, setStatus] = useState<Status>('waiting')
  const [error, setError] = useState('')

  const html = typeof args?.html === 'string' ? args.html : ''
  const fallbackTitle =
    typeof args?.title === 'string' && args.title.trim() !== '' ? args.title.trim() : 'Page'
  const title = html === '' ? fallbackTitle : titleOfPage(html, fallbackTitle)

  // Once a card has settled, a replay must not offer the bridge again. Keep
  // the first value so the start → result transition does not reload the page.
  const initialWaiting = useRef(phase !== 'result').current

  const doc = useMemo(() => {
    if (html === '') return ''
    const theme = readHostTheme()
    return buildPageDoc({ html, callId, themeCss: theme.css, waiting: initialWaiting })
  }, [html, callId, themeTick, initialWaiting])

  const settledUnanswered = recorded !== null && recorded.answered === false

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = frameRef.current
      if (!frame || event.source !== frame.contentWindow) return
      const message = event.data
      if (message === null || typeof message !== 'object' || message.callId !== callId) return

      if (message.type === HEIGHT_MESSAGE) {
        const next = Number(message.height)
        if (Number.isFinite(next)) setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(next))))
        return
      }

      if (message.type === SUBMIT_MESSAGE) void deliver(message)
    }

    function reply(id: unknown, ok: boolean, payload: Record<string, unknown>) {
      frameRef.current?.contentWindow?.postMessage({ type: RESULT_MESSAGE, callId, id, ok, ...payload }, '*')
    }

    async function deliver(message: any) {
      const id = typeof message.id === 'string' ? message.id : ''
      const summary = typeof message.summary === 'string' ? message.summary.trim() : ''
      const data = message.data ?? null

      if (summary === '' || summary.length > MAX_SUMMARY_CHARS) {
        setStatus('error')
        setError('Summary is empty or too long')
        reply(id, false, { error: 'invalid-summary' })
        return
      }

      let encoded: string
      try {
        encoded = JSON.stringify(data)
      } catch {
        setStatus('error')
        setError('Submitted data is not JSON-serializable')
        reply(id, false, { error: 'invalid-data' })
        return
      }
      if (new TextEncoder().encode(encoded).byteLength > MAX_DATA_BYTES) {
        setStatus('error')
        setError(`Submitted data exceeds ${MAX_DATA_BYTES} bytes`)
        reply(id, false, { error: 'data-too-large' })
        return
      }

      setStatus('submitting')
      setError('')
      try {
        const response = await fetch(ANSWER_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ callId, summary, data }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? 'This call has ended (timed out or already submitted).'
              : String(payload?.error ?? `HTTP ${response.status}`),
          )
        }
        setStatus('sent')
        reply(id, true, { answer: { summary, data } })
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        setStatus('error')
        setError(message)
        reply(id, false, { error: message })
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [callId])

  if (html === '') {
    return (
      <div style={footerStyle}>
        <span>Preparing page…</span>
      </div>
    )
  }

  let footer: { text: string; color: string }
  if (phase === 'result' || recorded !== null) {
    if (recorded?.answered === true && typeof recorded.summary === 'string') {
      footer = { text: `Submitted: ${recorded.summary}`, color: 'var(--dsw-alias-state-success-primary)' }
    } else if (settledUnanswered) {
      footer = {
        text: 'Not submitted (timed out); the agent continued',
        color: 'var(--dsw-alias-state-warn-label)',
      }
    } else {
      footer = { text: 'Call ended', color: 'var(--dsw-alias-label-tertiary)' }
    }
  } else if (status === 'submitting') {
    footer = { text: 'Submitting…', color: 'var(--dsw-alias-label-secondary)' }
  } else if (status === 'sent') {
    footer = { text: 'Submitted; waiting for the agent', color: 'var(--dsw-alias-state-success-primary)' }
  } else if (status === 'error') {
    footer = { text: `Submit failed: ${error}`, color: 'var(--dsw-alias-state-error-primary)' }
  } else {
    footer = { text: 'Waiting for submission', color: 'var(--dsw-alias-label-tertiary)' }
  }

  return (
    <div data-dsh-surface="card" style={cardStyle}>
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={doc}
        sandbox="allow-scripts allow-forms"
        style={{
          display: 'block',
          width: '100%',
          height,
          border: 0,
          borderRadius: 'var(--dsw-radius-lg)',
          background: 'transparent',
          overflow: 'auto',
        }}
      />
      <div style={footerStyle}>
        <span style={dotStyle(footer.color)} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {footer.text}
        </span>
      </div>
    </div>
  )
}

/**
 * The authenticated page-submission route.
 *
 * The route is registered on the host's `/api` channel via
 * `ctx.connection.fetch`, so the host has already checked Host/Origin,
 * browser authentication, and that the caller is the owner peer before this
 * handler runs. Everything here is payload validation plus first-answer-wins.
 */

import type { WaitRegistry } from './wait.ts'

export const ANSWER_PATH = '/api/dsh-surface/answer'
export const MAX_SUMMARY_CHARS = 500
export const MAX_DATA_BYTES = 16_000
const MAX_CALL_ID_CHARS = 200

/** Every failure the route reports, one code per validation step. */
export type AnswerErrorCode =
  | 'method-not-allowed'
  | 'invalid-json'
  | 'invalid-body'
  | 'invalid-call-id'
  | 'invalid-summary'
  | 'invalid-data'
  | 'data-too-large'
  | 'not-waiting'

type AnswerBody = { ok: true } | { ok: false; error: AnswerErrorCode }

function json(status: number, body: AnswerBody): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Validate one submission and hand it to the waiting call.
 *
 * @param waits - the host-wide waiting map.
 * @param request - the buffered POST body.
 * @returns `200` accepted, else the first failed validation step.
 */
export async function handleAnswerRequest(waits: WaitRegistry, request: Request): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method-not-allowed' })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { ok: false, error: 'invalid-json' })
  }
  if (body === null || typeof body !== 'object') return json(400, { ok: false, error: 'invalid-body' })

  const { callId, summary, data = null } = body as Record<string, unknown>
  if (typeof callId !== 'string' || callId.length === 0 || callId.length > MAX_CALL_ID_CHARS) {
    return json(400, { ok: false, error: 'invalid-call-id' })
  }
  if (typeof summary !== 'string' || summary.trim().length === 0 || summary.length > MAX_SUMMARY_CHARS) {
    return json(400, { ok: false, error: 'invalid-summary' })
  }

  let encoded: string | undefined
  try {
    encoded = JSON.stringify(data)
  } catch {
    return json(400, { ok: false, error: 'invalid-data' })
  }
  if (encoded === undefined) return json(400, { ok: false, error: 'invalid-data' })
  if (new TextEncoder().encode(encoded).byteLength > MAX_DATA_BYTES) {
    return json(413, { ok: false, error: 'data-too-large' })
  }

  const result = waits.answer(callId, { summary: summary.trim(), data })
  if (!result.ok) return json(404, { ok: false, error: result.code })
  return json(200, { ok: true })
}

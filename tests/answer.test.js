import test from 'node:test'
import assert from 'node:assert/strict'
import { createWaitRegistry } from '../src/wait.js'
import { handleAnswerRequest } from '../src/answer.js'

function answerRequest(body) {
  return new Request('http://localhost/api/dsh-surface/answer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('a valid submission resolves the waiting call', async () => {
  const waits = createWaitRegistry()
  const pending = waits.create('call-1')

  const response = await handleAnswerRequest(
    waits,
    answerRequest({
      callId: 'call-1',
      summary: '  chose the blue theme  ',
      data: { theme: 'blue' },
    }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.deepEqual(await pending, {
    answered: true,
    summary: 'chose the blue theme',
    data: { theme: 'blue' },
  })
})

test('a submission for a call that is not waiting is a 404', async () => {
  const waits = createWaitRegistry()
  const response = await handleAnswerRequest(
    waits,
    answerRequest({
      callId: 'missing',
      summary: 'x',
      data: null,
    }),
  )

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { ok: false, error: 'not-waiting' })
})

test('a missing callId or summary is a 400', async () => {
  const waits = createWaitRegistry()

  const missingCall = await handleAnswerRequest(waits, answerRequest({ summary: 'x' }))
  assert.equal(missingCall.status, 400)

  const missingSummary = await handleAnswerRequest(waits, answerRequest({ callId: 'c' }))
  assert.equal(missingSummary.status, 400)
})

test('oversized data is a 413 and leaves the call waiting', async () => {
  const waits = createWaitRegistry()
  const controller = new AbortController()
  const pending = waits.create('call-1', { signal: controller.signal })

  const response = await handleAnswerRequest(
    waits,
    answerRequest({
      callId: 'call-1',
      summary: 'too much',
      data: 'x'.repeat(17000),
    }),
  )

  assert.equal(response.status, 413)
  assert.equal(waits.size, 1)

  controller.abort()
  await assert.rejects(pending, (error) => error.code === 'ABORTED')
})

test('only POST is accepted', async () => {
  const waits = createWaitRegistry()
  const response = await handleAnswerRequest(waits, new Request('http://localhost/api/dsh-surface/answer'))
  assert.equal(response.status, 405)
})

test('the first submission wins and the second is a 404', async () => {
  const waits = createWaitRegistry()
  const pending = waits.create('call-1')

  const first = await handleAnswerRequest(waits, answerRequest({ callId: 'call-1', summary: 'one', data: 1 }))
  const second = await handleAnswerRequest(
    waits,
    answerRequest({ callId: 'call-1', summary: 'two', data: 2 }),
  )

  assert.equal(first.status, 200)
  assert.equal(second.status, 404)
  assert.equal((await pending).summary, 'one')
})

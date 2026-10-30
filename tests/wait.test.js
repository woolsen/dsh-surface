import test from 'node:test'
import assert from 'node:assert/strict'
import { createWaitRegistry } from '../src/wait.js'

test('answering resolves the waiting call with the submitted summary and data', async () => {
  const waits = createWaitRegistry()
  const pending = waits.create('call-1')

  assert.deepEqual(waits.answer('call-1', { summary: 'picked blue', data: { color: 'blue' } }), { ok: true })
  assert.deepEqual(await pending, {
    answered: true,
    summary: 'picked blue',
    data: { color: 'blue' },
  })
})

test('the first answer wins and a second answer is refused', async () => {
  const waits = createWaitRegistry()
  const pending = waits.create('call-1')

  waits.answer('call-1', { summary: 'first', data: 1 })
  assert.deepEqual(waits.answer('call-1', { summary: 'second', data: 2 }), {
    ok: false,
    code: 'not-waiting',
  })
  assert.deepEqual(await pending, { answered: true, summary: 'first', data: 1 })
})

test('an unknown call is not waiting', () => {
  const waits = createWaitRegistry()
  assert.deepEqual(waits.answer('missing', { summary: 'x', data: null }), {
    ok: false,
    code: 'not-waiting',
  })
})

test('aborting the tool signal rejects the wait', async () => {
  const waits = createWaitRegistry()
  const controller = new AbortController()
  const pending = waits.create('call-1', { signal: controller.signal })
  controller.abort()

  await assert.rejects(pending, (error) => error.code === 'ABORTED')
})

test('a wait that runs out resolves as unanswered instead of hanging', async () => {
  const waits = createWaitRegistry()
  const pending = waits.create('call-1', { timeoutMs: 10 })

  assert.deepEqual(await pending, { answered: false, reason: 'timeout' })
})

test('a settled call can be created again under a reused id', async () => {
  const waits = createWaitRegistry()
  waits.answer('call-1', { summary: 'stale', data: null })

  const pending = waits.create('call-1')
  waits.answer('call-1', { summary: 'fresh', data: 'ok' })
  assert.equal((await pending).summary, 'fresh')
})

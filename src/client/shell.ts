/**
 * Build the document that runs inside the card's sandboxed iframe.
 *
 * The page is opaque-origin (`sandbox="allow-scripts allow-forms"`, no
 * `allow-same-origin`), and its own CSP blocks network, nested frames, and
 * form navigation. The only way out is the postMessage bridge below:
 * `dshSurface.submit(data, summary)` asks the host card to POST the answer to
 * the authenticated route.
 */

export const HEIGHT_MESSAGE = 'dsh-surface/height'
export const SUBMIT_MESSAGE = 'dsh-surface/submit'
export const RESULT_MESSAGE = 'dsh-surface/result'

export interface PageOptions {
  html: string
  callId: string
  themeCss: string
  waiting: boolean
}

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** JSON embedded in a script body must not be able to close the element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function bridgeScript(callId: string, waiting: boolean): string {
  return `(function () {
  if (window.parent === window) return;
  var CALL_ID = ${scriptJson(callId)};
  var WAITING = ${waiting ? 'true' : 'false'};
  var nextId = 0;
  var pending = new Map();
  var answer = undefined;

  function submit(data, summary) {
    return new Promise(function (resolve, reject) {
      if (!WAITING) return reject(new Error('This page is not waiting for an answer'));
      if (typeof summary !== 'string' || !summary.trim()) return reject(new Error('summary is required'));
      if (navigator.userActivation && !navigator.userActivation.isActive) return reject(new Error('submit must be triggered by a click'));
      var payload;
      try { payload = data === undefined ? null : JSON.parse(JSON.stringify(data)); }
      catch (error) { return reject(new Error('data must be JSON-serializable')); }
      var id = String(++nextId);
      pending.set(id, { resolve: resolve, reject: reject });
      window.parent.postMessage({
        type: ${scriptJson(SUBMIT_MESSAGE)},
        callId: CALL_ID,
        id: id,
        summary: summary.trim(),
        data: payload
      }, '*');
    });
  }

  window.dshSurface = {
    submit: submit,
    get answered() { return answer !== undefined; },
    get answer() { return answer; }
  };
  // Pages written for OpenChamber or the earlier dshRender name keep working.
  window.dshRender = window.dshSurface;
  window.openchamber = window.dshSurface;

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (event.source !== window.parent || !message) return;
    if (message.type !== ${scriptJson(RESULT_MESSAGE)} || message.callId !== CALL_ID) return;
    var entry = message.id ? pending.get(message.id) : undefined;
    if (entry) {
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.answer);
      else entry.reject(new Error(message.error || 'The answer was not delivered'));
    }
    if (message.ok) answer = message.answer;
    window.dispatchEvent(new CustomEvent('dsh-surface:result', { detail: message }));
  });
})();`
}

function heightScript(callId: string): string {
  return `(function () {
  if (window.parent === window) return;
  var CALL_ID = ${scriptJson(callId)};
  function measure() {
    var root = document.documentElement;
    var body = document.body;
    var style = body ? getComputedStyle(body) : null;
    var margins = style ? (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0) : 0;
    var bodyHeight = body ? Math.max(body.scrollHeight, body.getBoundingClientRect().height) + margins : 0;
    var height = Math.ceil(bodyHeight > 0 ? bodyHeight : (root ? root.scrollHeight : 0));
    if (!(height > 0)) return;
    window.parent.postMessage({ type: ${scriptJson(HEIGHT_MESSAGE)}, callId: CALL_ID, height: height }, '*');
  }
  var ticks = 0;
  function loop() {
    measure();
    ticks += 1;
    if (ticks < 120) requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  var interval = setInterval(measure, 250);
  setTimeout(function () { clearInterval(interval); measure(); }, 10000);
  window.addEventListener('load', measure);
  window.addEventListener('resize', measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(document.documentElement);
  if (window.MutationObserver) {
    new MutationObserver(measure).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  }
})();`
}

/**
 * Insert the frame's head additions into the authored document, keeping the
 * author's markup byte-for-byte. The same fallbacks OpenChamber uses: after
 * `<head>`, else after `<html>`, else after the doctype, else prepend a head.
 */
export function buildPageDoc({ html, callId, themeCss, waiting }: PageOptions): string {
  const head = [
    /<meta\s[^>]*charset/i.test(html.slice(0, 4096)) ? '' : '<meta charset="utf-8">',
    /<meta\s[^>]*name\s*=\s*["']?viewport/i.test(html)
      ? ''
      : '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    `<style id="dsh-surface-theme">${themeCss}</style>`,
    `<script>${bridgeScript(callId, waiting)}</script>`,
    `<script>${heightScript(callId)}</script>`,
  ].join('')

  const headMatch = /<head(?:\s[^>]*)?>/i.exec(html)
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length
    return html.slice(0, at) + head + html.slice(at)
  }
  const htmlMatch = /<html(?:\s[^>]*)?>/i.exec(html)
  if (htmlMatch) {
    const at = htmlMatch.index + htmlMatch[0].length
    return `${html.slice(0, at)}<head>${head}</head>${html.slice(at)}`
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)
  if (doctype) {
    const at = doctype[0].length
    return `${html.slice(0, at)}<head>${head}</head>${html.slice(at)}`
  }
  return `<!doctype html><head>${head}</head>${html}`
}

/** The page's own <title>, else its first h1–h3, else the fallback. */
export function titleOfPage(html: string, fallback = 'Page'): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (title?.[1]?.trim()) return title[1].trim().slice(0, 120)
  const heading = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html)
  if (heading?.[1]) {
    const text = heading[1].replace(/<[^>]+>/g, '').trim()
    if (text !== '') return text.slice(0, 120)
  }
  return fallback
}

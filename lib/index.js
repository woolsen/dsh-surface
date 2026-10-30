// src/index.ts
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/answer.ts
var ANSWER_PATH = "/api/dsh-surface/answer";
var MAX_SUMMARY_CHARS = 500;
var MAX_DATA_BYTES = 16e3;
var MAX_CALL_ID_CHARS = 200;
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
async function handleAnswerRequest(waits, request) {
  if (request.method !== "POST") return json(405, { ok: false, error: "method-not-allowed" });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "invalid-json" });
  }
  if (body === null || typeof body !== "object") return json(400, { ok: false, error: "invalid-body" });
  const { callId, summary, data = null } = body;
  if (typeof callId !== "string" || callId.length === 0 || callId.length > MAX_CALL_ID_CHARS) {
    return json(400, { ok: false, error: "invalid-call-id" });
  }
  if (typeof summary !== "string" || summary.trim().length === 0 || summary.length > MAX_SUMMARY_CHARS) {
    return json(400, { ok: false, error: "invalid-summary" });
  }
  let encoded;
  try {
    encoded = JSON.stringify(data);
  } catch {
    return json(400, { ok: false, error: "invalid-data" });
  }
  if (encoded === void 0) return json(400, { ok: false, error: "invalid-data" });
  if (new TextEncoder().encode(encoded).byteLength > MAX_DATA_BYTES) {
    return json(413, { ok: false, error: "data-too-large" });
  }
  const result = waits.answer(callId, { summary: summary.trim(), data });
  if (!result.ok) return json(404, { ok: false, error: result.code });
  return json(200, { ok: true });
}

// src/wait.ts
var DEFAULT_TIMEOUT_MS = 10 * 60 * 1e3;
function abortError() {
  const error = new Error("the render call was cancelled");
  error.code = "ABORTED";
  return error;
}
function createWaitRegistry({
  defaultTimeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const pending = /* @__PURE__ */ new Map();
  function dispose(callId, entry) {
    entry.settled = true;
    pending.delete(callId);
    if (entry.timer !== null) clearTimeout(entry.timer);
    if (entry.onAbort !== void 0 && entry.signal !== void 0) {
      entry.signal.removeEventListener("abort", entry.onAbort);
    }
  }
  function settle(callId, entry, value) {
    if (entry.settled) return false;
    dispose(callId, entry);
    entry.resolve(value);
    return true;
  }
  function fail(callId, entry, error) {
    if (entry.settled) return false;
    dispose(callId, entry);
    entry.reject(error);
    return true;
  }
  return {
    create(callId, options = {}) {
      if (pending.has(callId)) throw new Error(`a wait for ${callId} already exists`);
      const { signal, timeoutMs = defaultTimeoutMs } = options;
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const entry = { resolve, reject, settled: false, timer: null, signal };
      pending.set(callId, entry);
      if (signal !== void 0 && signal.aborted) {
        fail(callId, entry, abortError());
        return promise;
      }
      if (signal !== void 0) {
        entry.onAbort = () => fail(callId, entry, abortError());
        signal.addEventListener("abort", entry.onAbort, { once: true });
      }
      if (timeoutMs > 0) {
        entry.timer = setTimeout(
          () => settle(callId, entry, { answered: false, reason: "timeout" }),
          timeoutMs
        );
      }
      return promise;
    },
    answer(callId, answer) {
      const entry = pending.get(callId);
      if (entry === void 0) return { ok: false, code: "not-waiting" };
      settle(callId, entry, { answered: true, summary: answer.summary, data: answer.data });
      return { ok: true };
    },
    get size() {
      return pending.size;
    }
  };
}

// src/index.ts
var name = "dsh-surface";
var inject = ["tools"];
var MAX_HTML_BYTES = 2e5;
var MAX_TITLE_CHARS = 120;
var DEFAULT_TIMEOUT_SECONDS = 600;
var MAX_TIMEOUT_SECONDS = 3600;
function titleOf(args) {
  if (typeof args?.title === "string" && args.title.trim() !== "") return args.title.trim();
  return "Interactive page";
}
function apply(ctx, config = {}) {
  const configuredTimeout = config.defaultTimeoutSeconds;
  const defaultTimeoutSeconds = typeof configuredTimeout === "number" && Number.isFinite(configuredTimeout) ? configuredTimeout : DEFAULT_TIMEOUT_SECONDS;
  const waits = createWaitRegistry({ defaultTimeoutMs: defaultTimeoutSeconds * 1e3 });
  ctx.tools.register(
    defineTool({
      name: "render",
      description: 'Show a self-contained HTML page inline in the conversation and wait for the user to submit it. Use it when a decision, configuration, selection, or short form is easier to operate than to describe. The call blocks until the page calls dshSurface.submit(data, summary), the user cancels, or the wait times out. Keep the page self-contained: no network requests, no external scripts or stylesheets. Provide a complete HTML document and make every control that finishes the task call dshSurface.submit(data, summary) with a short summary and a JSON-serializable data object. The tool returns {"answered":true,"summary","data"} or {"answered":false,"reason":"timeout"}.',
      parameters: {
        html: {
          type: "string",
          required: true,
          description: "A complete, self-contained HTML document. Inline CSS and JS only; no network requests, external assets, or top-level navigation. Call dshSurface.submit(data, summary) from a click handler to finish."
        },
        title: {
          type: "string",
          description: "Short title shown on the tool card and used to name the page when it has no <title>."
        },
        timeoutSeconds: {
          type: "number",
          description: "How long to wait for the submission. Defaults to 600 seconds; use a positive value. When it expires the call returns answered:false so the agent can continue."
        }
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: String(value) }]
      },
      presentCall: (args) => ({ card: "generic", title: `Page \xB7 ${titleOf(args)}` }),
      async execute(args, exec) {
        const html = typeof args?.html === "string" ? args.html : "";
        if (html.trim() === "") throw new Error("render needs a non-empty html document");
        if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) {
          throw new Error(
            `render html is longer than ${MAX_HTML_BYTES} bytes; split the page or inline less data`
          );
        }
        if (typeof args?.title === "string" && args.title.length > MAX_TITLE_CHARS) {
          throw new Error(`render title is longer than ${MAX_TITLE_CHARS} characters`);
        }
        const requested = Number(args?.timeoutSeconds);
        const timeoutMs = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_TIMEOUT_SECONDS) * 1e3 : defaultTimeoutSeconds * 1e3;
        const result = await waits.create(exec.callId, { signal: exec.signal, timeoutMs });
        return JSON.stringify(result);
      }
    })
  );
  ctx.inject(["connection"], (scope) => {
    const connection = scope.get("connection");
    const fetchRoutes = connection?.fetch;
    if (fetchRoutes === void 0 || typeof fetchRoutes.register !== "function") return;
    scope.effect(
      () => fetchRoutes.register({
        path: ANSWER_PATH,
        methods: ["POST"],
        requestBody: "buffered",
        fetch: (request) => handleAnswerRequest(waits, request)
      }),
      "dsh-surface: answer route"
    );
  });
}
export {
  apply,
  inject,
  name
};

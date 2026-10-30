window.__ModuleLoader__.load({ id: "dsh-surface", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/RenderCard.tsx
var import_react = require("react");

// src/client/shell.ts
var HEIGHT_MESSAGE = "dsh-surface/height";
var SUBMIT_MESSAGE = "dsh-surface/submit";
var RESULT_MESSAGE = "dsh-surface/result";
var CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join("; ");
function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function bridgeScript(callId, waiting) {
  return `(function () {
  if (window.parent === window) return;
  var CALL_ID = ${scriptJson(callId)};
  var WAITING = ${waiting ? "true" : "false"};
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
})();`;
}
function heightScript(callId) {
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
})();`;
}
function buildPageDoc({ html, callId, themeCss, waiting }) {
  const head = [
    /<meta\s[^>]*charset/i.test(html.slice(0, 4096)) ? "" : '<meta charset="utf-8">',
    /<meta\s[^>]*name\s*=\s*["']?viewport/i.test(html) ? "" : '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    `<style id="dsh-surface-theme">${themeCss}</style>`,
    `<script>${bridgeScript(callId, waiting)}<\/script>`,
    `<script>${heightScript(callId)}<\/script>`
  ].join("");
  const headMatch = /<head(?:\s[^>]*)?>/i.exec(html);
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length;
    return html.slice(0, at) + head + html.slice(at);
  }
  const htmlMatch = /<html(?:\s[^>]*)?>/i.exec(html);
  if (htmlMatch) {
    const at = htmlMatch.index + htmlMatch[0].length;
    return `${html.slice(0, at)}<head>${head}</head>${html.slice(at)}`;
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) {
    const at = doctype[0].length;
    return `${html.slice(0, at)}<head>${head}</head>${html.slice(at)}`;
  }
  return `<!doctype html><head>${head}</head>${html}`;
}
function titleOfPage(html, fallback = "Page") {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title?.[1]?.trim()) return title[1].trim().slice(0, 120);
  const heading = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html);
  if (heading?.[1]) {
    const text = heading[1].replace(/<[^>]+>/g, "").trim();
    if (text !== "") return text.slice(0, 120);
  }
  return fallback;
}

// src/client/theme.ts
var TOKENS = {
  "--background": ["--dsw-alias-bg-base"],
  "--foreground": ["--dsw-alias-label-primary"],
  "--muted": ["--dsw-alias-bg-layer-2", "--dsw-alias-bg-layer-1"],
  "--muted-foreground": ["--dsw-alias-label-secondary", "--dsw-alias-label-tertiary"],
  "--card": ["--dsw-alias-bg-layer-1", "--dsw-alias-bg-base"],
  "--card-foreground": ["--dsw-alias-label-primary"],
  "--border": ["--dsw-alias-border-l2", "--dsw-alias-border-l3"],
  "--primary": ["--dsw-alias-brand-primary-new-colorprimary-new-color", "--dsw-alias-state-business-primary"],
  "--primary-foreground": ["--dsw-alias-label-primary-inverted"],
  "--radius": ["--dsw-radius-md", "--dsw-radius-lg"],
  "--font-sans": ["--dsw-font-family"],
  "--font-mono": ["--ds-font-family-code", "--dsw-font-family-code"]
};
var CHART_TOKENS = [
  "--dsw-static-deepseek-500",
  "--dsw-static-green-500",
  "--dsw-static-amber-400",
  "--dsw-static-red-600",
  "--dsw-static-violet-500",
  "--dsw-static-neutral-bluish-300"
];
var LIGHT = {
  "--background": "#ffffff",
  "--foreground": "#0f1115",
  "--muted": "#f4f5f7",
  "--muted-foreground": "#6b7280",
  "--card": "#ffffff",
  "--card-foreground": "#0f1115",
  "--border": "#e5e7eb",
  "--primary": "#4d6bfe",
  "--primary-foreground": "#ffffff",
  "--radius": "10px",
  "--font-sans": '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
  "--font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace"
};
var DARK = {
  "--background": "#0f1115",
  "--foreground": "#f5f6f8",
  "--muted": "#1a1d23",
  "--muted-foreground": "#9aa1ad",
  "--card": "#15181e",
  "--card-foreground": "#f5f6f8",
  "--border": "#2a2f38",
  "--primary": "#6e8bff",
  "--primary-foreground": "#0b0d11",
  "--radius": "10px",
  "--font-sans": '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
  "--font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace"
};
var CHART_FALLBACK_LIGHT = ["#4d6bfe", "#16a34a", "#f59e0b", "#dc2626", "#8b5cf6", "#64748b"];
var CHART_FALLBACK_DARK = ["#7c95ff", "#4ade80", "#fbbf24", "#f87171", "#a78bfa", "#94a3b8"];
function hostIsDark() {
  const body = document.body;
  const root = document.documentElement;
  if (body?.hasAttribute("data-ds-dark-theme")) return true;
  if (body?.dataset?.theme === "dark") return true;
  if (root.dataset?.theme === "dark") return true;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}
function readVar(style, names) {
  for (const name2 of names) {
    const value = style.getPropertyValue(name2).trim();
    if (value !== "") return value;
  }
  return void 0;
}
function readHostTheme() {
  const dark = hostIsDark();
  const fallback = dark ? DARK : LIGHT;
  const style = getComputedStyle(document.documentElement);
  const vars = {};
  for (const [alias, names] of Object.entries(TOKENS)) {
    vars[alias] = readVar(style, names) ?? fallback[alias] ?? "";
  }
  const charts = CHART_TOKENS.map((name2) => style.getPropertyValue(name2).trim());
  const chartFallback = dark ? CHART_FALLBACK_DARK : CHART_FALLBACK_LIGHT;
  for (let index = 0; index < 6; index += 1) {
    vars[`--chart-${index + 1}`] = charts[index] || chartFallback[index];
  }
  const declarations = Object.entries(vars).filter(([, value]) => value !== "").map(([name2, value]) => `${name2}: ${value};`).join("");
  const css = `:root{${declarations}color-scheme:${dark ? "dark" : "light"};}
html,body{margin:0;background:transparent;color:var(--foreground);font-family:var(--font-sans);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;}
body{padding:2px 2px 10px;}
a{color:var(--primary);}
::selection{background:color-mix(in srgb, var(--primary) 26%, transparent);}
`;
  return { css, dark };
}

// src/client/RenderCard.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var ANSWER_PATH = "/api/dsh-surface/answer";
var MAX_DATA_BYTES = 16e3;
var MAX_SUMMARY_CHARS = 500;
var MIN_HEIGHT = 120;
var MAX_HEIGHT = 1400;
function readArgs(block) {
  const raw = block && typeof block === "object" && "kind" in block ? block.call?.argsRaw : block?.argsRaw;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function readResult(block) {
  if (!block || typeof block !== "object" || !("kind" in block)) return null;
  const content = Array.isArray(block.content) ? block.content : [];
  const text = content.find((part) => part?.type === "text" && typeof part.text === "string")?.text;
  if (typeof text !== "string" || text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function useThemeTick() {
  const [tick, setTick] = (0, import_react.useState)(0);
  (0, import_react.useEffect)(() => {
    const bump = () => setTick((value) => value + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true });
    if (document.body) observer.observe(document.body, { attributes: true });
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", bump);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", bump);
    };
  }, []);
  return tick;
}
var cardStyle = {
  minWidth: 0,
  maxWidth: "100%",
  margin: "4px 0 2px"
};
var footerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minHeight: 20,
  marginTop: 4,
  color: "var(--dsw-alias-label-tertiary)",
  fontSize: 11,
  lineHeight: "16px"
};
var dotStyle = (color) => ({
  width: 6,
  height: 6,
  borderRadius: 3,
  background: color,
  flex: "none"
});
function RenderCard({ callId, phase, block }) {
  const args = (0, import_react.useMemo)(() => readArgs(block), [block]);
  const recorded = (0, import_react.useMemo)(() => readResult(block), [block]);
  const themeTick = useThemeTick();
  const frameRef = (0, import_react.useRef)(null);
  const [height, setHeight] = (0, import_react.useState)(160);
  const [status, setStatus] = (0, import_react.useState)("waiting");
  const [error, setError] = (0, import_react.useState)("");
  const html = typeof args?.html === "string" ? args.html : "";
  const fallbackTitle = typeof args?.title === "string" && args.title.trim() !== "" ? args.title.trim() : "Page";
  const title = html === "" ? fallbackTitle : titleOfPage(html, fallbackTitle);
  const initialWaiting = (0, import_react.useRef)(phase !== "result").current;
  const doc = (0, import_react.useMemo)(() => {
    if (html === "") return "";
    const theme = readHostTheme();
    return buildPageDoc({ html, callId, themeCss: theme.css, waiting: initialWaiting });
  }, [html, callId, themeTick, initialWaiting]);
  const settledUnanswered = recorded !== null && recorded.answered === false;
  (0, import_react.useEffect)(() => {
    function onMessage(event) {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const message = event.data;
      if (message === null || typeof message !== "object" || message.callId !== callId) return;
      if (message.type === HEIGHT_MESSAGE) {
        const next = Number(message.height);
        if (Number.isFinite(next)) setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(next))));
        return;
      }
      if (message.type === SUBMIT_MESSAGE) void deliver(message);
    }
    function reply(id, ok, payload) {
      frameRef.current?.contentWindow?.postMessage({ type: RESULT_MESSAGE, callId, id, ok, ...payload }, "*");
    }
    async function deliver(message) {
      const id = typeof message.id === "string" ? message.id : "";
      const summary = typeof message.summary === "string" ? message.summary.trim() : "";
      const data = message.data ?? null;
      if (summary === "" || summary.length > MAX_SUMMARY_CHARS) {
        setStatus("error");
        setError("Summary is empty or too long");
        reply(id, false, { error: "invalid-summary" });
        return;
      }
      let encoded;
      try {
        encoded = JSON.stringify(data);
      } catch {
        setStatus("error");
        setError("Submitted data is not JSON-serializable");
        reply(id, false, { error: "invalid-data" });
        return;
      }
      if (new TextEncoder().encode(encoded).byteLength > MAX_DATA_BYTES) {
        setStatus("error");
        setError(`Submitted data exceeds ${MAX_DATA_BYTES} bytes`);
        reply(id, false, { error: "data-too-large" });
        return;
      }
      setStatus("submitting");
      setError("");
      try {
        const response = await fetch(ANSWER_PATH, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ callId, summary, data })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            response.status === 404 ? "This call has ended (timed out or already submitted)." : String(payload?.error ?? `HTTP ${response.status}`)
          );
        }
        setStatus("sent");
        reply(id, true, { answer: { summary, data } });
      } catch (cause) {
        const message2 = cause instanceof Error ? cause.message : String(cause);
        setStatus("error");
        setError(message2);
        reply(id, false, { error: message2 });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [callId]);
  if (html === "") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: footerStyle, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Preparing page\u2026" }) });
  }
  let footer;
  if (phase === "result" || recorded !== null) {
    if (recorded?.answered === true && typeof recorded.summary === "string") {
      footer = { text: `Submitted: ${recorded.summary}`, color: "var(--dsw-alias-state-success-primary)" };
    } else if (settledUnanswered) {
      footer = {
        text: "Not submitted (timed out); the agent continued",
        color: "var(--dsw-alias-state-warn-label)"
      };
    } else {
      footer = { text: "Call ended", color: "var(--dsw-alias-label-tertiary)" };
    }
  } else if (status === "submitting") {
    footer = { text: "Submitting\u2026", color: "var(--dsw-alias-label-secondary)" };
  } else if (status === "sent") {
    footer = { text: "Submitted; waiting for the agent", color: "var(--dsw-alias-state-success-primary)" };
  } else if (status === "error") {
    footer = { text: `Submit failed: ${error}`, color: "var(--dsw-alias-state-error-primary)" };
  } else {
    footer = { text: "Waiting for submission", color: "var(--dsw-alias-label-tertiary)" };
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { "data-dsh-surface": "card", style: cardStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "iframe",
      {
        ref: frameRef,
        title,
        srcDoc: doc,
        sandbox: "allow-scripts allow-forms",
        style: {
          display: "block",
          width: "100%",
          height,
          border: 0,
          borderRadius: "var(--dsw-radius-lg)",
          background: "transparent",
          overflow: "auto"
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: footerStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: dotStyle(footer.color) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: footer.text })
    ] })
  ] });
}

// src/client/index.tsx
var name = "dsh-surface";
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject(
    "tool.call.toolview",
    () => ctx.slots.register({ name: "tool.call.toolview", key: "render" }, RenderCard)
  );
}
return module.exports; } });

# Security policy

## Supported versions

Only the latest published `0.1.x` release is supported while the project is in early development.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected version, a minimal reproduction, and the impact you believe it has.

You can expect an acknowledgement within a few days. Please give us a reasonable window to ship a fix before publishing details.

## Threat model

`dsh-surface` renders model-authored HTML. The security boundary is the iframe plus the authenticated answer route:

- the page runs with an **opaque origin** (`sandbox="allow-scripts allow-forms"`, no `allow-same-origin`), so it cannot read the host document, cookies, or storage;
- a document CSP blocks network requests, nested frames, form navigation, and top-level navigation; only inline scripts/styles and `data:`/`blob:` images are allowed;
- the submission route is registered on `ctx.connection.fetch`, so the host's browser-trust fence, authentication, and owner-peer check run before the handler;
- the handler validates `callId`, `summary` (≤ 500 chars), and `data` (≤ 16 KB JSON), and the first answer wins;
- the bridge only accepts messages whose `event.source` is the card's own iframe.

### In scope

- escaping the iframe sandbox or reading host data;
- bypassing the CSP to reach the network;
- submitting to another session's call, or answering without a user gesture;
- oversized payloads or memory growth in the pending map.

### Out of scope

- a page displaying misleading or offensive content (it is model output);
- links the user clicks that open external sites;
- denial of service caused by running untrusted HTML generally;
- the host's own authentication or the operating system account.

## Hardening notes for page authors

- Keep pages self-contained: no external scripts, styles, fonts, or images.
- Do not request passwords, API keys, or other secrets in a page.
- Treat submitted data as untrusted when it reaches a tool or a shell command.

# Contributing

Thanks for taking the time to improve `dsh-surface`.

## Development setup

Requirements:

- Node.js `^22.19.0 || >=24`
- npm 10+
- a DeepSeekRuntime checkout or installation with the Web UI, for manual testing

```sh
git clone https://github.com/woolsen/dsh-surface.git
cd dsh-surface
npm install
npm run check
```

`npm run check` runs lint, typecheck, the unit tests, the build, and a formatting check. Run it before opening a pull request.

## Useful commands

| Command             | What it does                                                               |
| ------------------- | -------------------------------------------------------------------------- |
| `npm test`          | `node:test` suite (`tests/*.test.js`)                                      |
| `npm run build`     | bundles `lib/index.js` (host ESM) and `lib/client.js` (loader-wrapped CJS) |
| `npm run lint`      | oxlint over `src`, `tests`, `scripts`                                      |
| `npm run typecheck` | `tsc --noEmit`                                                             |
| `npm run format`    | Prettier write                                                             |
| `npm run check`     | everything CI runs                                                         |

## Manual testing

Build, link the package into a scratch profile, and start the Web UI:

```sh
npm run build
dsh --profile surface-dev --from-default-profile web --dump-config
dsh plugin --profile surface-dev add link:$PWD
dsh --profile surface-dev web --no-open --port 3099
```

Open the printed `?token=` URL, start a new session, and ask the model to call `render` with a self-contained HTML document. `examples/approval.html` is a ready-made page. Check:

- the page appears while the tool is running;
- the footer says the page is waiting;
- clicking submit produces one `POST /api/dsh-surface/answer` with `200`;
- the tool result contains the submitted `summary` and `data`;
- a second submit is refused.

## Architecture

Read [docs/architecture.md](docs/architecture.md) first. The important invariants:

- the tool waits **only** through `src/wait.js`; do not add a second pending map;
- the answer route must stay on `ctx.connection.fetch` (owner peer, authenticated), never on `ctx.webServer` without admission;
- the iframe keeps `sandbox="allow-scripts allow-forms"` **without** `allow-same-origin`;
- pages must stay self-contained; network access is blocked by CSP on purpose.

## Pull requests

- Keep changes focused; one concern per PR.
- Add or update tests for behaviour changes (the wait/answer logic is unit-tested).
- Update `README.md`, `README.zh-CN.md`, and `CHANGELOG.md` when the user-facing surface changes.
- Describe the manual test you ran (dsh version, browser, what you saw).
- Do not commit secrets, tokens, or generated `node_modules`.

## Commit messages

Use the imperative mood and a short scope when useful:

```text
fix(client): keep the submitted page mounted while the turn settles
docs: document the desktop verification gap
```

## Release

Maintainers only:

```sh
npm version patch   # or minor/major
git push --follow-tags
```

The `release` workflow publishes to npm with provenance when a `v*` tag is pushed. It needs the `NPM_TOKEN` repository secret unless npm trusted publishing is configured.

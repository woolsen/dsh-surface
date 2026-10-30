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

Releases are tag-driven and fully automated. Maintainers only bump the version and push the tag:

```sh
npm version patch   # or minor / major; creates a commit and a vX.Y.Z tag
git push --follow-tags
```

The `Release` workflow then:

1. checks that the tag matches `package.json` (for example `v0.1.1` ↔ `0.1.1`);
2. runs `npm ci` and `npm run check`;
3. publishes to npm with provenance **only if that version is not already on the registry**;
4. creates a GitHub Release with generated notes (or leaves an existing release alone).

Requirements:

- a **Trusted Publisher** connection on npmjs.com for `dsh-surface`: provider `GitHub Actions`, organization or user `woolsen`, repository `dsh-surface`, workflow filename `release.yml`, and **Allow `npm publish`** checked. Publishing then authenticates through OIDC — there is **no `NPM_TOKEN` secret** and no npm token to rotate;
- a public repository, so npm can attest the provenance through `id-token: write`;
- the workflow upgrades npm to `^11.5.1` before publishing, because the CLI bundled with Node 22 is too old for trusted publishing.

Re-running a tag is safe: the publish step is skipped when the version already exists, and the release step is idempotent. Do not run `npm publish` locally for a version that the workflow will publish; pick one path.

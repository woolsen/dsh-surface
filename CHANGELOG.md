# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Source is TypeScript end to end: the host half and the build script moved from `.js`/`.mjs` to `.ts`, and the tests run `.ts` directly through Node type stripping. The published `lib/` bundles and the plugin's runtime behaviour are unchanged.

## [0.1.1] - 2026-10-30

### Changed

- Releases are now published from GitHub Actions with npm provenance. No runtime changes.

## [0.1.0] - 2026-10-30

### Added

- `render` tool: inline, sandboxed HTML pages with optional blocking submission.
- Host-side wait registry: first answer wins, cancellation, per-call timeout.
- Authenticated `POST /api/dsh-surface/answer` route on the host's `/api` channel.
- Client tool view for `tool.call.toolview` with auto height and host theme tokens.
- `dshSurface.submit(data, summary)` page bridge; `dshRender` and `openchamber` aliases.
- OpenChamber-compatible page variables (`--background`, `--foreground`, `--chart-*`).
- Unit tests for wait/answer semantics (12 cases).
- CI, release workflow, issue/PR templates, security and contribution guides.

### Known limitations

- Pages fold with the tool-call group after a turn settles.
- No local image support yet.
- HTML is stored in the tool arguments (session log).
- Desktop (Electron) is not verified.
- No waiting notification, persistence, or version history.

[Unreleased]: https://github.com/woolsen/dsh-surface/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/woolsen/dsh-surface/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/woolsen/dsh-surface/releases/tag/v0.1.0

# Contributing

Thanks for helping improve `opencode-archivist`.

## Development setup

Requirements:

- Node.js 20 or newer
- npm
- OpenCode is optional for unit and integration tests

```bash
npm ci
npm run check
npm run build
npm run package:check
```

The project uses Node's built-in test runner through `tsx`. Please add or
update tests when changing archive formats, path handling, settings behavior,
or plugin entrypoints.

## Pull requests

- Keep changes focused and explain the user-facing impact.
- Do not commit `node_modules`, local archives, secrets, or generated build
  output.
- Keep the plugin local-only unless a change explicitly documents and tests
  the privacy and permission implications.
- Make sure `npm run check` passes before opening a pull request.

## Commit and release notes

Use a clear commit message and update `CHANGELOG.md` for user-visible
changes. Releases are published from a clean tagged commit after CI passes.

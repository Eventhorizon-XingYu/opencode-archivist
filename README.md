# opencode-archivist

An [OpenCode](https://opencode.ai) plugin that turns your agent conversations
into a durable, searchable **local Markdown archive**.

Every session is captured automatically when it goes idle, distilled into a
readable Markdown file with a summary at the top, and indexed in a master
`index.md` — so your chat history becomes a first-class asset you can grep,
browse, and open in Obsidian / VS Code / GitHub, instead of an ephemeral
terminal log.

> **Why this exists.** Agent conversations contain hard-won context: decisions,
> workarounds, and follow-up tasks. OpenCode keeps them in its own storage, but
> that storage is not designed for long-term reading, searching, or syncing.
> This plugin projects them into plain Markdown you own.

---

## What it does

- **Captures** OpenCode sessions on the `session.idle` hook (after each turn).
- **Writes one Markdown file per session**, with a YAML frontmatter block and a
  human-readable transcript of the **natural-language conversation only**
  (user/assistant text; tool-call payloads and model reasoning are omitted).
- **Summarizes** each session deterministically — goal, conclusions, next steps,
  and caveats — so you understand a session without reading the whole transcript.
- **Builds a master `index.md`** (recent-first, with links) across all sessions.
- **Organizes by agent / project / date** on disk.
- **Leaves an adapter seam** so Claude Code, Cursor, or any other agent can be
  added later by implementing one interface.

No database, no JSON warehouse, no runtime dependencies. Just Markdown files.

---

## Install

Install the plugin from npm and add it to your OpenCode config
(`~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-archivist"]
}
```

OpenCode installs npm plugins automatically with Bun on startup.

### Configuration

Configure the archive location (and a few other knobs) with the two-element
plugin form:

```json
{
  "plugin": [
    [
      "opencode-archivist",
      {
        "archiveDir": "~/Documents/my-agent-archive",
        "agent": "opencode",
        "indexName": "index.md"
      }
    ]
  ]
}
```

| Option       | Default                 | Description                                        |
| ------------ | ----------------------- | -------------------------------------------------- |
| `archiveDir` | `~/.opencode/archive`   | Root directory for the archive. Accepts an absolute path or a `~`-relative path (`~` is expanded to your home dir). |
| `agent`      | `"opencode"`            | Source tag used in frontmatter and folder layout.  |
| `indexName`  | `"index.md"`            | Name of the master index file.                     |
| `filenameTemplate` | `"{title}"`        | Filename template with `{title}` / `{id}` / `{date}` / `{project}` placeholders. |
| `webPort`    | `8866`                  | Port for the local settings web server (loopback-only). |
| `enabled`    | `true`                  | Whether session archiving is enabled. `false` disables saving. |

### Filename template

The session `.md` filename is generated from `filenameTemplate` and then
sanitized + truncated to 60 chars:

| Placeholder | Meaning                    |
| ----------- | -------------------------- |
| `{title}`   | Session title (falls back to id) |
| `{id}`      | Raw session id             |
| `{date}`    | UTC `YYYY-MM-DD`           |
| `{project}` | Sanitized project name     |

Unknown placeholders stay literal; an empty render falls back to the id.

### Settings web UI + TUI command

The plugin runs a loopback web server (default `http://127.0.0.1:8866`) serving
a settings page where you can change the archive directory, filename template,
and a **"保存对话" (save conversations) on/off toggle** without editing
`opencode.json`. In OpenCode's TUI, run the palette command
**"Archivist: 打开设置"** to open it in your browser.

Runtime settings persist to `~/.opencode/archivist-settings.json` and take
effect on the **next** archived session (no restart). Precedence:
**settings file > config options > defaults**.

The web API (same origin as the page):
- `GET /api/settings` → `{ settings, effective, sources }`
- `PUT /api/settings` → `{ archiveDir?, filenameTemplate?, enabled? }` (`null` clears a key)
- `POST /api/preview` → `{ template }` → `{ filename }`
- `GET /api/health` → `{ service: "opencode-archivist" }`

> **Deployment note**: register the plugin by its **directory** (not the
> `dist/index.js` file) so both the `server` and `tui` entrypoints resolve:
>
> ```json
> { "plugin": [["D:/path/to/opencode-archivist", { "archiveDir": "..." }]] }
> ```

---

## How it works

1. OpenCode loads the plugin and invokes its `server` entry, which registers an
   `event` hook.
2. On `session.idle`, the plugin pulls the session, its messages (with parts),
   and its todo list via the OpenCode SDK client.
3. It projects them onto a canonical `SessionRecord`, summarizes, renders
   Markdown, and writes the file — then rebuilds `index.md`.

The capture is **idempotent**: re-writing a session refreshes its file without
duplicating index rows.

---

## Archive layout

```
<archiveDir>/
├── index.md                                  # master index (recent-first)
└── opencode/                                 # agent/source tag
    └── <project-name>/
        └── <YYYY-MM-DD>/
            └── <summarizing-title>.md        # one file per session, named by title
```

Each session file is named after its **title** (sanitized, truncated to 60
chars) rather than a raw session id. If two sessions on the same day share a
title, the second gets a short id suffix (`-<idTail>`) so neither is
overwritten; the full `session_id` is always preserved in the frontmatter.

See [`example/`](example/) for a real, generated sample — including
[`example/index.md`](example/index.md) and a
[session file](example/opencode/awesome-api/2024-08-13/Add pagination to the list endpoint.md).

### Session file shape

Each session file has a YAML frontmatter block plus a readable body:

```markdown
---
session_id: "ses_01J5KQ2XW"
agent: "opencode"
title: "Add pagination to the list endpoint"
project: "/home/dev/awesome-api"
project_name: "awesome-api"
date: "2024-08-13"
created: "2024-08-13T01:20:00.000Z"
status: "completed"
tags: ["opencode", "awesome-api"]
summary: "Add cursor-based pagination to GET /items ... → Done. The endpoint now accepts `cursor` ..."
goal: "Add cursor-based pagination to GET /items ..."
conclusion: "Done. The endpoint now accepts `cursor` ..."
next_steps: ["Document the new `cursor` param ...", "Add rate-limit tests ..."]
notes: []
messages: 2
tool_calls: 2
additions: 42
deletions: 7
files: 3
---

# Add pagination to the list endpoint

## Summary
- **Goal:** ...
- **Conclusions:** ...
- **Next steps:** ...
- **Notes:** _none_

## Transcript

### User
> 2024-08-13T01:20:00.000Z
...

### Assistant
> 2024-08-13T01:21:40.000Z
...
```

---

## Summarization

The default summarizer is a **deterministic heuristic** — no LLM call, no cost,
no latency, always works offline:

- **goal** — the first non-empty user message (truncated).
- **conclusion** — the last non-empty assistant message (truncated).
- **next steps** — open todos (`pending` / `in_progress`).
- **notes** — any turns that ended in an error.
- **summary** — a compressed `goal → conclusion` one-liner.

A future LLM-backed summarizer is a planned extension; it only needs to
implement the `Summarizer` interface (see below).

---

## Extending to other agents

The plugin is architected around a single canonical record and a small adapter
seam. Adding Claude Code, Cursor, or another agent means implementing **one**
interface and plugging it in — the summarizer, renderer, and archive writer are
already agent-agnostic.

```ts
// src/types.ts (excerpt)
export interface AgentAdapter {
  readonly name: string;
  getSessionRecord(sessionID: string): Promise<SessionRecord | null>;
}
```

- `SessionRecord` / `MessageRecord` / `SummaryRecord` are the canonical,
  agent-agnostic records (see [`src/types.ts`](src/types.ts)).
- [`src/opencode-adapter.ts`](src/opencode-adapter.ts) is the reference
  implementation: it reads a structural `SessionClient` (no SDK import at
  runtime) and maps it to a `SessionRecord`.
- A new adapter only has to produce a `SessionRecord` from its own capture
  source (hooks, JSONL transcript, etc.).

---

## Development

Requires Node.js ≥ 20.

```bash
npm install          # install dev dependencies
npm run typecheck    # strict TypeScript check (src + test + scripts)
npm test             # unit tests (node:test via tsx)
npm run build        # compile to dist/
npm run integration  # real-surface check: writes files + index from a mock client
npm run smoke        # load-contract check + `opencode serve` smoke
```

Project structure:

```
src/
  index.ts             plugin entry: `export default { id, server }`
  types.ts             canonical records + adapter/summarizer seams
  opencode-adapter.ts  OpenCode client -> SessionRecord
  summary.ts           deterministic heuristic summarizer
  markdown.ts          SessionRecord -> markdown (frontmatter + body)
  archive.ts           path layout, file writes, index rebuild
test/                  node:test suites (TDD, RED -> GREEN)
scripts/               integration + smoke + example generator
example/               generated sample output
```

---

## License

[MIT](LICENSE)

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import plugin, {
  archiveSession,
  resolveOptions,
} from "../src/index.js";
import type {
  ArchivistOptions,
  SessionClient,
  SessionLike,
  SessionMessageLike,
  TodoLike,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION: SessionLike = {
  id: "ses_demo123",
  title: "Fix login bug",
  directory: "C:\\work\\my-app",
  projectID: "p1",
  time: { created: 1723000000000, updated: 1723000100000 },
  summary: { additions: 3, deletions: 1, files: 2 },
};

const MESSAGES: SessionMessageLike[] = [
  {
    info: {
      id: "m1",
      role: "user",
      time: { created: 1723000000000 },
      model: { providerID: "anthropic", modelID: "claude" },
    },
    parts: [{ type: "text", text: "Fix the login bug in auth.ts" }],
  },
  {
    info: {
      id: "m2",
      role: "assistant",
      time: { created: 1723000050000, completed: 1723000100000 },
      providerID: "anthropic",
      modelID: "claude",
      cost: 0.001,
      tokens: { input: 10, output: 20 },
    },
    parts: [
      { type: "text", text: "Fixed the token refresh logic." },
      {
        type: "tool",
        callID: "c1",
        tool: "edit",
        state: { status: "completed", input: { file: "auth.ts" }, output: "ok" },
      },
    ],
  },
];

const TODOS: TodoLike[] = [
  { content: "Add tests", status: "in_progress" },
  { content: "Ship it", status: "pending" },
  { content: "Write docs", status: "completed" },
];

function makeClient(session: SessionLike | undefined): SessionClient {
  return {
    get: async () => session,
    messages: async () => MESSAGES,
    todo: async () => TODOS,
  };
}

async function tempOptions(): Promise<{ opts: ArchivistOptions; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "archivist-"));
  const opts: ArchivistOptions = {
    archiveDir: dir,
    agent: "opencode",
    indexName: "index.md",
    filenameTemplate: "{title}",
    webPort: 8866,
    enabled: true,
  };
  return { opts, cleanup: async () => rm(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// resolveOptions
// ---------------------------------------------------------------------------

test("resolveOptions defaults archiveDir to ~/.opencode/archive", () => {
  const opts = resolveOptions();
  assert.match(opts.archiveDir, /\.opencode[\\/]archive$/);
  assert.equal(opts.agent, "opencode");
  assert.equal(opts.indexName, "index.md");
});

test("resolveOptions expands a leading ~ in a user-provided archiveDir", () => {
  const opts = resolveOptions({ archiveDir: "~/notes/sessions" });
  assert.match(opts.archiveDir, /notes[\\/]sessions$/);
  assert.equal(opts.archiveDir.startsWith("~"), false);
});

test("resolveOptions passes through an explicit archiveDir unchanged", () => {
  const opts = resolveOptions({ archiveDir: "D:\\archive" });
  assert.equal(opts.archiveDir, "D:\\archive");
});

// ---------------------------------------------------------------------------
// archiveSession (full pipeline: adapter -> summary -> markdown -> archive)
// ---------------------------------------------------------------------------

test("archiveSession writes a markdown file and rebuilds the index", async () => {
  const { opts, cleanup } = await tempOptions();
  try {
    const path = await archiveSession(makeClient(SESSION), SESSION.id, opts);
    assert.ok(path, "expected a written path");
    const content = await readFile(path, "utf8");
    assert.match(content, /^---\n/);
    assert.match(content, /session_id: "ses_demo123"/);
    assert.match(content, /title: "Fix login bug"/);

    const index = await readFile(join(opts.archiveDir, "index.md"), "utf8");
    assert.match(index, /Fix login bug\.md/);
    assert.match(index, /Fix login bug/);
  } finally {
    await cleanup();
  }
});

test("archiveSession is idempotent (re-writing does not duplicate index rows)", async () => {
  const { opts, cleanup } = await tempOptions();
  try {
    await archiveSession(makeClient(SESSION), SESSION.id, opts);
    await archiveSession(makeClient(SESSION), SESSION.id, opts);
    const index = await readFile(join(opts.archiveDir, "index.md"), "utf8");
    const occurrences = index.split("Fix login bug.md").length - 1;
    assert.equal(occurrences, 1, "index should contain a single row for the session");
  } finally {
    await cleanup();
  }
});

test("archiveSession returns null and writes nothing when the session is missing", async () => {
  const { opts, cleanup } = await tempOptions();
  try {
    const result = await archiveSession(makeClient(undefined), "nope", opts);
    assert.equal(result, null);
    await assert.rejects(access(join(opts.archiveDir, "opencode")), /ENOENT/);
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// Export contract
// ---------------------------------------------------------------------------

test("default export is a server plugin module (server fn + id)", () => {
  assert.equal(typeof plugin.server, "function");
  assert.equal(typeof plugin.id, "string");
  assert.equal(plugin.id, "opencode-archivist");
});

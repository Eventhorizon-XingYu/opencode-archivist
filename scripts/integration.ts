/**
 * Integration check: drive the REAL production pipeline (archiveSession) with
 * two mock sessions and verify the archive tree + index are written correctly.
 *
 * Run: `npm run integration` (exit 0 = pass). This is the "real surface"
 * evidence that the plugin's core path produces files on disk.
 */

import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { archiveSession } from "../src/index.js";
import type {
  ArchivistOptions,
  SessionClient,
  SessionLike,
  SessionMessageLike,
  TodoLike,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Mock clients (structural SessionClient, no SDK dependency)
// ---------------------------------------------------------------------------

function session(id: string, title: string, created: number, directory: string): SessionLike {
  return {
    id,
    title,
    directory,
    time: { created, updated: created + 60_000 },
    summary: { additions: 2, deletions: 1, files: 1 },
  };
}

function makeClient(s: SessionLike): SessionClient {
  const created = s.time?.created ?? 0;
  const messages: SessionMessageLike[] = [
    {
      info: { id: `${s.id}-m1`, role: "user", time: { created } },
      parts: [{ type: "text", text: `Goal for ${s.title}` }],
    },
    {
      info: {
        id: `${s.id}-m2`,
        role: "assistant",
        time: { created: created + 30_000, completed: created + 60_000 },
      },
      parts: [
        { type: "text", text: `Conclusion for ${s.title}` },
        {
          type: "tool",
          callID: `${s.id}-c1`,
          tool: "edit",
          state: { status: "completed", input: { file: "a.ts" }, output: "ok" },
        },
      ],
    },
  ];
  const todos: TodoLike[] = [{ content: "Follow up", status: "pending" }];
  return {
    get: async () => s,
    messages: async () => messages,
    todo: async () => todos,
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const root = await mkdtemp(join(tmpdir(), "archivist-int-"));
const opts: ArchivistOptions = { archiveDir: root, agent: "opencode", indexName: "index.md", filenameTemplate: "{title}", webPort: 8866, enabled: true };

const sessions: SessionLike[] = [
  session("ses_old", "Older session", 1723000000000, "C:\\work\\alpha"),
  session("ses_new", "Newer session", 1723000100000, "C:\\work\\beta"),
];

try {
  for (const s of sessions) {
    const path = await archiveSession(makeClient(s), s.id, opts);
    console.log(`wrote ${path}`);
  }

  // Verify index has both rows, ordered newest-first.
  const indexPath = join(root, "index.md");
  const index = await readFile(indexPath, "utf8");
  const newPos = index.indexOf("Newer session");
  const oldPos = index.indexOf("Older session");
  if (newPos < 0 || oldPos < 0) throw new Error("index missing session rows");
  if (newPos > oldPos) throw new Error("index not ordered by date descending");

  // Verify every relative link in the index resolves to a real file.
  for (const match of index.matchAll(/\]\(([^)]+\.md)\)/g)) {
    const rel = match[1]!;
    const target = join(root, rel.replaceAll("/", "\\"));
    await readFile(target, "utf8");
  }

  // Template scenario: a custom filenameTemplate must shape the written path.
  const templateOpts: ArchivistOptions = { ...opts, filenameTemplate: "{date}-{title}" };
  const templated = session("ses_tpl", "Templated session", 1723000200000, "C:\\work\\gamma");
  const tplPath = await archiveSession(makeClient(templated), templated.id, templateOpts);
  console.log(`wrote (template) ${tplPath}`);
  if (!tplPath?.endsWith("2024-08-07-Templated session.md")) {
    throw new Error(`template filename mismatch: ${tplPath}`);
  }

  // Print the archive tree + index for human inspection.
  console.log("\n=== archive tree ===");
  await printTree(root, "");
  console.log("\n=== index.md ===");
  console.log(index);

  console.log("\nINTEGRATION PASS");
} finally {
  await rm(root, { recursive: true, force: true });
}

async function printTree(dir: string, prefix: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const marker = entry.isDirectory() ? "[dir] " : "[file]";
    console.log(`${prefix}${marker}${entry.name}`);
    if (entry.isDirectory()) {
      await printTree(join(dir, entry.name), `${prefix}  `);
    }
  }
}

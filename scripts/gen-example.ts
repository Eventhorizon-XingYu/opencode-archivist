// One-off generator: writes a realistic sample session + index into example/.
// Run: `npx tsx scripts/gen-example.ts`
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { archiveSession } from "../src/index.js";
import type { ArchivistOptions, SessionClient, SessionLike, SessionMessageLike, TodoLike } from "../src/types.js";

const outDir = join(process.cwd(), "example");

const session: SessionLike = {
  id: "ses_01J5KQ2XW",
  title: "Add pagination to the list endpoint",
  directory: "/home/dev/awesome-api",
  projectID: "p1",
  time: { created: 1723512000000, updated: 1723512600000 },
  summary: { additions: 42, deletions: 7, files: 3 },
};

const client: SessionClient = {
  get: async () => session,
  messages: async (): Promise<SessionMessageLike[]> => [
    {
      info: { id: "m1", role: "user", time: { created: 1723512000000 }, model: { providerID: "anthropic", modelID: "claude-sonnet-4-5" } },
      parts: [{ type: "text", text: "Add cursor-based pagination to GET /items. Keep it backward compatible with the existing `limit` param." }],
    },
    {
      info: { id: "m2", role: "assistant", time: { created: 1723512100000, completed: 1723512600000 }, providerID: "anthropic", modelID: "claude-sonnet-4-5", cost: 0.0023, tokens: { input: 1800, output: 640 } },
      parts: [
        { type: "reasoning", text: "I'll add an optional `cursor` query param, parse it into an opaque base64 offset, and return a `next_cursor` in the response envelope." },
        { type: "text", text: "Done. The endpoint now accepts `cursor` and returns `next_cursor` alongside `items`. Backward compatible — `limit` still works when `cursor` is omitted." },
        { type: "tool", callID: "c1", tool: "edit", state: { status: "completed", input: { filePath: "src/routes/items.ts" }, output: "applied" } },
        { type: "tool", callID: "c2", tool: "bash", state: { status: "completed", input: { command: "npm test -- items" }, output: "42 passed, 0 failed" } },
      ],
    },
  ],
  todo: async (): Promise<TodoLike[]> => [
    { content: "Add pagination to GET /items", status: "completed" },
    { content: "Document the new `cursor` param in OpenAPI spec", status: "pending" },
    { content: "Add rate-limit tests for deep pagination", status: "pending" },
  ],
};

const opts: ArchivistOptions = { archiveDir: outDir, agent: "opencode", indexName: "index.md", filenameTemplate: "{title}", webPort: 8866, enabled: true };

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const path = await archiveSession(client, session.id, opts);
console.log(`wrote ${path}`);

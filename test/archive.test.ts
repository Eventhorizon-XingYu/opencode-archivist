import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArchivistOptions, SessionRecord } from "../src/types.js";
import {
  rebuildIndex,
  sanitizeSegment,
  sessionPath,
  summarizeFilename,
  writeSession,
} from "../src/archive.js";

const BASE_MS = 1780000000000;
const DAY_MS = 86_400_000;

function makeOptions(archiveDir: string): ArchivistOptions {
  return {
    archiveDir,
    agent: "opencode",
    indexName: "index.md",
    filenameTemplate: "{title}",
    webPort: 8866,
    enabled: true,
  };
}

function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "ses-1",
    agent: "opencode",
    title: "Test session",
    project: "C:/dev/test-proj",
    projectName: "test-proj",
    createdAt: BASE_MS,
    updatedAt: BASE_MS,
    status: "completed",
    messages: [],
    todos: [],
    summary: { summary: "did stuff", keyConclusions: [], nextSteps: [], notes: [] },
    tags: ["archived"],
    stats: { messages: 1, toolCalls: 1, additions: 10, deletions: 2, files: 3 },
    ...overrides,
  };
}

/** UTC YYYY-MM-DD derived from epoch ms — must match sessionPath's derivation. */
function dateOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Minimal frontmatter-bearing markdown; rendering upstream is out of scope here. */
function withFrontmatter(record: SessionRecord): string {
  return [
    "---",
    `title: "${record.title}"`,
    `date: "${dateOf(record.createdAt)}"`,
    `status: ${record.status}`,
    `agent: ${record.agent}`,
    `project_name: ${record.projectName}`,
    `summary: "${record.summary.summary}"`,
    `session_id: "${record.id}"`,
    `tags: ["${record.tags.join('", "')}"]`,
    "---",
    "",
    `# ${record.title}`,
    "",
    "body",
  ].join("\n");
}

describe("archive write + path", () => {
  /** Fresh isolated archive dir, cleaned up when the test finishes. */
  async function freshArchive(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
    const tmp = await mkdtemp(join(tmpdir(), "archivist-"));
    t.after(async () => {
      await rm(tmp, { recursive: true, force: true });
    });
    return tmp;
  }

  test("S1 writeSession writes markdown at the exact sanitized path", async (t) => {
    const tmp = await freshArchive(t);
    const record = makeRecord({ id: "ses-roundtrip", title: "Round trip" });
    const options = makeOptions(tmp);
    const markdown = "# hello\n\narbitrary content\n";

    const expected = join(
      tmp,
      "opencode",
      "test-proj",
      dateOf(record.createdAt),
      "Round trip.md",
    );

    assert.equal(sessionPath(record, options), expected);

    const written = await writeSession(record, options, markdown);
    assert.equal(written, expected);
    assert.equal(await readFile(written, "utf8"), markdown);
  });

  test("S2 summarizeFilename falls back to id when title is absent or equals id", () => {
    assert.equal(
      summarizeFilename(makeRecord({ id: "ses-fallback", title: "ses-fallback" })),
      "ses-fallback",
    );
    assert.equal(summarizeFilename(makeRecord({ id: "ses-empty", title: "" })), "ses-empty");
    assert.equal(summarizeFilename(makeRecord({ id: "ses-ws", title: "   " })), "ses-ws");
  });

  test("S5 summarizeFilename sanitizes unsafe title characters", () => {
    assert.equal(
      summarizeFilename(makeRecord({ id: "ses-s", title: "Q&A: fix <bug>" })),
      "Q&A_ fix _bug_",
    );
  });

  test("S6 summarizeFilename truncates long titles and strips trailing space", () => {
    assert.equal(
      summarizeFilename(makeRecord({ id: "ses-l", title: "a".repeat(70) })),
      "a".repeat(60),
    );
    assert.equal(
      summarizeFilename(makeRecord({ id: "ses-l", title: "b".repeat(59) + " z" })),
      "b".repeat(59),
    );
  });

  test("S3 sanitizeSegment maps unsafe names to safe segments", () => {
    const cases: Array<[string, string]> = [
      ["CON", "_CON"], // reserved device name
      ["con", "_con"], // reserved check is case-insensitive
      ["a:b/c", "a_b_c"], // ':' and '/' replaced
      ["name.", "name"], // trailing dot trimmed
      [".hidden", "hidden"], // leading dot trimmed
      ["a  b", "a b"], // whitespace runs collapsed
      ["  ", "untitled"], // collapsed then trimmed to empty
      ["", "untitled"], // empty input
      ["a<b>c|d?e*f", "a_b_c_d_e_f"], // invalid filename chars replaced
      ["a\u0000b", "a_b"], // ASCII control char replaced
    ];
    for (const [input, expected] of cases) {
      assert.equal(
        sanitizeSegment(input),
        expected,
        `sanitizeSegment(${JSON.stringify(input)})`,
      );
    }
  });

  test("S4 rebuildIndex writes index.md with rows ordered by date descending", async (t) => {
    const tmp = await freshArchive(t);
    const options = makeOptions(tmp);
    const newer = makeRecord({
      id: "ses-new",
      title: "Newer",
      createdAt: BASE_MS + 2 * DAY_MS,
      summary: { ...makeRecord().summary, summary: "newer work" },
    });
    const older = makeRecord({
      id: "ses-old",
      title: "Older",
      createdAt: BASE_MS,
      summary: { ...makeRecord().summary, summary: "older work" },
    });

    await writeSession(newer, options, withFrontmatter(newer));
    await writeSession(older, options, withFrontmatter(older));

    const indexPath = await rebuildIndex(options);
    const expectedIndex = join(tmp, "index.md");
    assert.equal(indexPath, expectedIndex);

    const content = await readFile(indexPath, "utf8");
    assert.ok(content.includes("| Date | Project | Title | Status | Summary |"));

    const rowLinks: string[] = [];
    for (const m of content.matchAll(/\]\(([^)]+\.md)\)/g)) {
      const rel = m[1];
      assert.ok(rel !== undefined, "link target missing");
      rowLinks.push(rel);
    }
    assert.equal(rowLinks.length, 2, "index must contain exactly 2 session rows");

    // Newer session (later date) must appear before the older one.
    assert.ok(
      content.indexOf("Newer.md") < content.indexOf("Older.md"),
      "rows not ordered by date descending",
    );

    // Every row link must resolve to an existing .md file under archiveDir.
    for (const rel of rowLinks) {
      await assert.doesNotReject(access(join(tmp, rel)), `link ${rel} does not resolve`);
    }
  });

  test("S7 writeSession disambiguates same-title collisions and stays idempotent", async (t) => {
    const tmp = await freshArchive(t);
    const options = makeOptions(tmp);
    const a = makeRecord({ id: "ses-AAAA1111", title: "Same", createdAt: BASE_MS });
    const b = makeRecord({ id: "ses-BBBB2222", title: "Same", createdAt: BASE_MS });

    const pathA = await writeSession(a, options, withFrontmatter(a));
    const pathB = await writeSession(b, options, withFrontmatter(b));

    const dir = join(tmp, "opencode", "test-proj", dateOf(BASE_MS));
    assert.equal(pathA, join(dir, "Same.md"));
    assert.equal(pathB, join(dir, `Same-${b.id.slice(-8)}.md`));

    // Both files survive with their own session_id (no silent overwrite).
    const fa = await readFile(pathA, "utf8");
    const fb = await readFile(pathB, "utf8");
    assert.ok(fa.includes('session_id: "ses-AAAA1111"'));
    assert.ok(fb.includes('session_id: "ses-BBBB2222"'));

    // Re-writing the same session stays idempotent (same path, no extra suffix).
    assert.equal(await writeSession(a, options, withFrontmatter(a)), pathA);

    // Index still lists exactly two distinct rows.
    const index = await readFile(join(tmp, "index.md"), "utf8");
    const rows = [...index.matchAll(/\]\(([^)]+\.md)\)/g)];
    assert.equal(rows.length, 2, "index must contain exactly 2 rows after collision");
  });
});

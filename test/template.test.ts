import { test } from "node:test";
import assert from "node:assert/strict";

import type { SessionRecord } from "../src/types.js";
import { FILENAME_PLACEHOLDERS, renderFilenameTemplate } from "../src/template.js";
import { summarizeFilename } from "../src/archive.js";

const CREATED = Date.UTC(2025, 0, 15, 10, 30, 0); // 2025-01-15

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "ses-abc123",
    agent: "opencode",
    title: "Fix login bug",
    project: "C:/dev/app",
    projectName: "app",
    createdAt: CREATED,
    updatedAt: CREATED,
    status: "completed",
    messages: [],
    todos: [],
    summary: { summary: "", keyConclusions: [], nextSteps: [], notes: [] },
    tags: [],
    stats: { messages: 0, toolCalls: 0, additions: 0, deletions: 0, files: 0 },
    ...overrides,
  };
}

test("T1.1 substitutes {title} with the effective title (falls back to id)", () => {
  assert.equal(renderFilenameTemplate("{title}", record()), "Fix login bug");
  assert.equal(renderFilenameTemplate("{title}", record({ title: "ses-abc123" })), "ses-abc123");
  assert.equal(renderFilenameTemplate("{title}", record({ title: "" })), "ses-abc123");
});

test("T1.2 substitutes {id}, {date}, {project}", () => {
  assert.equal(
    renderFilenameTemplate("{date}-{id}-{project}", record()),
    "2025-01-15-ses-abc123-app",
  );
});

test("T1.3 leaves unknown placeholders literal", () => {
  assert.equal(
    renderFilenameTemplate("{title}-{unknown}", record()),
    "Fix login bug-{unknown}",
  );
});

test("T1.4 renders then sanitizes and truncates to 60 chars", () => {
  const long = "a".repeat(70);
  assert.equal(summarizeFilename(record({ title: long }), "{title}"), "a".repeat(60));
});

test("T1.5 default template preserves legacy title-based behavior", () => {
  assert.equal(summarizeFilename(record()), "Fix login bug");
  assert.equal(summarizeFilename(record({ title: "Round trip" })), "Round trip");
});

test("T1.6 falls back to id when the template renders empty", () => {
  assert.equal(summarizeFilename(record(), ""), "ses-abc123");
  assert.equal(summarizeFilename(record(), "   "), "ses-abc123");
});

test("T1.7 exposes the documented placeholder set", () => {
  assert.deepEqual([...FILENAME_PLACEHOLDERS], ["{title}", "{id}", "{date}", "{project}"]);
});

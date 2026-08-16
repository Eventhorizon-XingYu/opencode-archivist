import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { SessionRecord } from "../src/types.js";
import {
  summarizeSession,
  createHeuristicSummarizer,
} from "../src/summary.js";

/** Deterministic fixture builder — every field a plain value, no fakes. */
function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "ses_test",
    agent: "opencode",
    title: "Test session",
    project: "/tmp/project",
    projectName: "project",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_010_000,
    status: "completed",
    messages: [],
    todos: [],
    summary: {
      summary: "",
      keyConclusions: [],
      nextSteps: [],
      notes: [],
    },
    tags: [],
    stats: { messages: 0, toolCalls: 0, additions: 0, deletions: 0, files: 0 },
    ...overrides,
  };
}

const USER_TEXT = "Add a deterministic heuristic summarizer to the archivist plugin";
const ASSISTANT_TEXT =
  "Implemented summarizeSession and createHeuristicSummarizer, backed by node:test scenarios and strict TypeScript.";
const LONG_USER_TEXT = "x".repeat(250) + " tail-marker";
const LONG_ASSISTANT_TEXT = "y".repeat(520) + " tail-marker";

describe("summarizeSession (heuristic)", () => {
  it("S1 happy: goal from first user message, conclusion from last assistant, nextSteps from open todos", () => {
    const record = makeSession({
      messages: [
        {
          id: "m1",
          role: "user",
          time: { created: 1_700_000_000_000 },
          text: USER_TEXT,
          toolCalls: [],
        },
        {
          id: "m2",
          role: "assistant",
          time: { created: 1_700_000_005_000 },
          text: "first assistant answer",
          toolCalls: [],
        },
        {
          id: "m3",
          role: "assistant",
          time: { created: 1_700_000_010_000 },
          text: ASSISTANT_TEXT,
          toolCalls: [],
        },
      ],
      todos: [
        { content: "Write README", status: "pending" },
        { content: "Ship docs", status: "completed" },
        { content: "Wire plugin hook", status: "in_progress" },
      ],
    });

    const result = summarizeSession(record);

    assert.equal(result.goal, USER_TEXT);
    assert.equal(result.keyConclusions[0], ASSISTANT_TEXT);
    assert.deepEqual(result.nextSteps, ["Write README", "Wire plugin hook"]);
    assert.equal(typeof result.summary, "string");
    assert.ok(result.summary.length > 0);
    assert.ok(!result.summary.includes("\n"), "summary must be one line");
    assert.ok(result.summary.includes(USER_TEXT));
    assert.ok(result.summary.includes(ASSISTANT_TEXT));
  });

  it("S1 truncation: long user text capped at 200 chars with ellipsis, long conclusion capped at 500", () => {
    const record = makeSession({
      messages: [
        {
          id: "m1",
          role: "user",
          time: { created: 1_700_000_000_000 },
          text: LONG_USER_TEXT,
          toolCalls: [],
        },
        {
          id: "m2",
          role: "assistant",
          time: { created: 1_700_000_010_000 },
          text: LONG_ASSISTANT_TEXT,
          toolCalls: [],
        },
      ],
    });

    const result = summarizeSession(record);

    const goal = result.goal;
    assert.ok(goal !== undefined, "goal should be defined");
    assert.ok(goal.length <= 200);
    assert.ok(goal.endsWith("…"));
    assert.ok(goal.startsWith("x".repeat(199)));

    const conclusion = result.keyConclusions[0];
    assert.ok(conclusion !== undefined, "conclusion should be defined");
    assert.ok(conclusion.length <= 500);
    assert.ok(conclusion.endsWith("…"));
  });

  it("S2 empty: never throws, falls back to the no-conversation placeholder", () => {
    const record = makeSession();

    assert.doesNotThrow(() => summarizeSession(record));
    const result = summarizeSession(record);
    assert.equal(result.summary, "(no conversation content)");
    assert.equal(result.goal, undefined);
    assert.deepEqual(result.keyConclusions, []);
    assert.deepEqual(result.nextSteps, []);
    assert.deepEqual(result.notes, []);
  });

  it("S2b tool-only messages: empty text with toolCalls does not fabricate a goal", () => {
    const record = makeSession({
      messages: [
        {
          id: "m1",
          role: "assistant",
          time: { created: 1_700_000_000_000 },
          text: "",
          toolCalls: [
            {
              id: "call_1",
              name: "bash",
              status: "completed",
              input: "ls -la",
              output: "file1 file2",
            },
          ],
        },
      ],
    });

    assert.doesNotThrow(() => summarizeSession(record));
    const result = summarizeSession(record);
    assert.equal(result.goal, undefined);
    assert.deepEqual(result.keyConclusions, []);
    assert.equal(result.summary, "(no conversation content)");
  });

  it("multi-line message text is flattened to a single line (no newlines leak into summary fields)", () => {
    const record = makeSession({
      messages: [
        {
          id: "m1",
          role: "user",
          time: { created: 1_700_000_000_000 },
          text: "第一行\n第二行\n第三行",
          toolCalls: [],
        },
        {
          id: "m2",
          role: "assistant",
          time: { created: 1_700_000_010_000 },
          text: "结论第一段\n\n结论第二段",
          toolCalls: [],
        },
      ],
    });

    const result = summarizeSession(record);

    assert.equal(result.goal, "第一行 第二行 第三行");
    assert.equal(result.keyConclusions[0], "结论第一段 结论第二段");
    assert.ok(!result.summary.includes("\n"), "summary must stay one line");
  });

  it("S3 notes: a message with error surfaces as 'role: error'", () => {
    const record = makeSession({
      messages: [
        {
          id: "m1",
          role: "assistant",
          time: { created: 1_700_000_000_000 },
          text: "something went sideways",
          error: "Tool execution failed: exit code 1",
          toolCalls: [],
        },
      ],
    });

    const result = summarizeSession(record);

    const note = result.notes[0];
    assert.ok(note !== undefined, "expected exactly one note");
    assert.equal(result.notes.length, 1);
    assert.ok(note.includes("Tool execution failed: exit code 1"));
    assert.ok(note.startsWith("assistant:"));
  });

  it("createHeuristicSummarizer returns the seam-compliant Summarizer", async () => {
    const summarizer = createHeuristicSummarizer();
    assert.equal(summarizer.name, "heuristic");
    const result = await summarizer.summarize(makeSession());
    assert.equal(result.summary, "(no conversation content)");
  });
});

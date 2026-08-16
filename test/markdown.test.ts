import { test } from "node:test";
import assert from "node:assert/strict";
import type { SessionRecord } from "../src/types.js";
import { renderSession, renderFrontmatter } from "../src/markdown.js";

const CREATED_MS = Date.UTC(2025, 0, 15, 10, 30, 0); // 2025-01-15T10:30:00.000Z
const UPDATED_MS = Date.UTC(2025, 0, 15, 11, 45, 0); // 2025-01-15T11:45:00.000Z

function makeRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "ses_abc",
    agent: "opencode",
    title: "Implement markdown renderer",
    project: "C:/work/opencode-archivist",
    projectName: "opencode-archivist",
    createdAt: CREATED_MS,
    updatedAt: UPDATED_MS,
    status: "completed",
    messages: [
      {
        id: "msg_1",
        role: "user",
        time: { created: CREATED_MS },
        text: "Write the renderer.",
        toolCalls: [],
      },
      {
        id: "msg_2",
        role: "assistant",
        time: { created: UPDATED_MS },
        text: "Done.",
        toolCalls: [
          {
            id: "call_1",
            name: "bash",
            status: "completed",
            input: "echo hi",
            output: "hi",
          },
        ],
      },
    ],
    todos: [],
    summary: {
      summary: "Rendered sessions to Markdown.",
      goal: "Add markdown output.",
      keyConclusions: ["Frontmatter matches types."],
      nextSteps: ["Write index builder."],
      notes: ["No truncation."],
    },
    tags: ["opencode", "demo"],
    stats: { messages: 2, toolCalls: 1, additions: 10, deletions: 2, files: 1 },
    ...overrides,
  };
}

/** Extract the YAML body between the `---` delimiters of a rendered document. */
function frontmatterOf(doc: string): string {
  assert.ok(doc.startsWith("---\n"), "document must start with the frontmatter opener");
  const end = doc.indexOf("\n---\n");
  assert.ok(end > 0, "document must contain the frontmatter closer");
  return doc.slice(4, end);
}

/** Return the frontmatter line for `key`, failing the test if absent. */
function lineFor(fm: string, key: string): string {
  const line = fm.split("\n").find((l) => l.startsWith(`${key}:`));
  assert.ok(line, `frontmatter is missing key "${key}"`);
  return line;
}

const EXPECTED_FRONTMATTER = [
  'session_id: "ses_abc"',
  'agent: "opencode"',
  'title: "Implement markdown renderer"',
  'project: "C:/work/opencode-archivist"',
  'project_name: "opencode-archivist"',
  'date: "2025-01-15"',
  'created: "2025-01-15T10:30:00.000Z"',
  'updated: "2025-01-15T11:45:00.000Z"',
  'status: "completed"',
  'tags: ["opencode", "demo"]',
  'summary: "Rendered sessions to Markdown."',
  'goal: "Add markdown output."',
  'conclusion: "Frontmatter matches types."',
  'next_steps: ["Write index builder."]',
  'notes: ["No truncation."]',
  "messages: 2",
  "tool_calls: 1",
  "additions: 10",
  "deletions: 2",
  "files: 1",
];

test("Test_renderSession_when_full_record_emits_complete_document", () => {
  const record = makeRecord();
  const output = renderSession(record);

  // (a) frontmatter block with every Frontmatter key and correct value.
  assert.ok(output.startsWith("---\n"), "output must start with the frontmatter opener");
  assert.deepEqual(frontmatterOf(output).split("\n"), EXPECTED_FRONTMATTER);

  // (b) H1 title.
  assert.ok(output.includes(`# ${record.title}`), "output must contain the H1 title");

  // (c) Summary section.
  assert.ok(output.includes("## Summary"), "output must contain a Summary section");

  // (d) Transcript section with user and assistant blocks.
  assert.ok(output.includes("## Transcript"), "output must contain a Transcript section");
  assert.ok(output.includes("### User"), "output must contain a User block");
  assert.ok(output.includes("### Assistant"), "output must contain an Assistant block");

  // (e) natural-language-only transcript: no tool-call payloads, no fenced
  // code blocks, no `#### Tool:` headers.
  assert.ok(!output.includes("```"), "transcript must not contain tool-call code blocks");
  assert.ok(!output.includes("#### Tool:"), "transcript must not render tool calls");
  assert.ok(!output.includes("Input:"), "transcript must not render raw tool input");
  assert.ok(!output.includes("echo hi"), "transcript must not leak tool payloads");
  assert.ok(output.includes("Done."), "assistant natural-language text must still be rendered");
});

test("Test_renderSession_skips_tool-only_messages_without_natural_language", () => {
  const record = makeRecord({
    messages: [
      {
        id: "msg_user",
        role: "user",
        time: { created: CREATED_MS },
        text: "Fix it.",
        toolCalls: [],
      },
      {
        // Tool-only assistant turn: no text, only a tool call. Must be skipped.
        id: "msg_tool_only",
        role: "assistant",
        time: { created: CREATED_MS + 1000 },
        text: "",
        toolCalls: [
          {
            id: "call_1",
            name: "bash",
            status: "completed",
            input: "echo hi",
            output: "hi",
          },
        ],
      },
      {
        id: "msg_final",
        role: "assistant",
        time: { created: CREATED_MS + 2000 },
        text: "Done.",
        toolCalls: [],
      },
    ],
  });

  const output = renderSession(record);

  // The two natural-language messages render, the tool-only turn does not.
  assert.ok(output.includes("### User"), "user message must render");
  assert.ok(output.includes("Fix it."), "user text must render");
  assert.ok(output.includes("Done."), "assistant text must render");
  assert.equal(
    output.split("### Assistant").length - 1,
    1,
    "only the assistant message with natural-language text should render",
  );
  assert.ok(!output.includes("echo hi"), "tool-only turn must not leak payloads");
});

test("Test_renderFrontmatter_when_full_record_returns_yaml_block", () => {
  const output = renderFrontmatter(makeRecord());
  assert.ok(output.startsWith("---\n"), "frontmatter must start with the opener");
  assert.ok(output.endsWith("---\n"), "frontmatter must end with the closer");
  assert.deepEqual(frontmatterOf(output).split("\n"), EXPECTED_FRONTMATTER);
});

test("Test_renderSession_when_empty_record_renders_without_throwing", () => {
  const record = makeRecord({
    messages: [],
    summary: { summary: "", goal: "", keyConclusions: [], nextSteps: [], notes: [] },
    tags: [],
    stats: { messages: 0, toolCalls: 0, additions: 0, deletions: 0, files: 0 },
  });

  assert.doesNotThrow(() => renderSession(record));

  const output = renderSession(record);
  const fm = frontmatterOf(output);
  assert.equal(lineFor(fm, "summary"), 'summary: "(no summary)"');
  assert.equal(lineFor(fm, "goal"), 'goal: ""');
  assert.equal(lineFor(fm, "tags"), "tags: []");
  assert.equal(lineFor(fm, "messages"), "messages: 0");
  assert.ok(output.includes(`# ${record.title}`), "empty document must still contain the title");
});

test("Test_renderFrontmatter_formats_scalars_correctly", () => {
  const fm = frontmatterOf(renderFrontmatter(makeRecord()));
  assert.equal(lineFor(fm, "date"), 'date: "2025-01-15"');
  assert.equal(lineFor(fm, "created"), 'created: "2025-01-15T10:30:00.000Z"');
  assert.equal(lineFor(fm, "updated"), 'updated: "2025-01-15T11:45:00.000Z"');
  assert.equal(lineFor(fm, "tags"), 'tags: ["opencode", "demo"]');
  assert.equal(lineFor(fm, "messages"), "messages: 2");
  assert.equal(lineFor(fm, "tool_calls"), "tool_calls: 1");
  assert.equal(lineFor(fm, "additions"), "additions: 10");
  assert.equal(lineFor(fm, "deletions"), "deletions: 2");
  assert.equal(lineFor(fm, "files"), "files: 1");
});

test("Test_renderFrontmatter_escapes_quotes_and_backslashes_in_strings", () => {
  const fm = frontmatterOf(renderFrontmatter(makeRecord({ title: 'Say "hi" \\n' })));
  assert.equal(lineFor(fm, "title"), 'title: "Say \\"hi\\" \\\\n"');
});

test("Test_renderFrontmatter_escapes_newlines_in_string_values", () => {
  const fm = frontmatterOf(
    renderFrontmatter(
      makeRecord({
        summary: {
          summary: "line1\nline2",
          goal: "goal with\nnewline",
          keyConclusions: ["conclusion\nmulti"],
          nextSteps: [],
          notes: [],
        },
      }),
    ),
  );
  assert.equal(lineFor(fm, "summary"), 'summary: "line1\\nline2"');
  assert.equal(lineFor(fm, "goal"), 'goal: "goal with\\nnewline"');
  assert.equal(lineFor(fm, "conclusion"), 'conclusion: "conclusion\\nmulti"');
});

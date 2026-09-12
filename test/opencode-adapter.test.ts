import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  SessionClient,
  SessionLike,
  SessionMessageLike,
  SessionRecord,
  TodoLike,
} from "../src/types.js";
import { OpenCodeAdapter } from "../src/opencode-adapter.js";

/**
 * Deterministic OpenCode-shaped fixtures for the `SessionClient` mock.
 * All fields are plain values typed against the structural shapes in
 * `src/types.ts` — no SDK import, no fakes.
 */

const FIXTURE_SESSION: SessionLike = {
  id: "ses_1",
  title: "Demo",
  directory: "C:\\work\\my-app",
  time: { created: 1_723_000_000_000, updated: 1_723_000_100_000 },
  summary: { additions: 3, deletions: 1, files: 2 },
};

const FIXTURE_MESSAGES: SessionMessageLike[] = [
  {
    info: {
      id: "m1",
      role: "user",
      time: { created: 1_723_000_000_000 },
      model: { providerID: "p", modelID: "m" },
    },
    parts: [{ type: "text", text: "Fix the bug" }],
  },
  {
    info: {
      id: "m2",
      role: "assistant",
      time: { created: 1_723_000_005_000, completed: 1_723_000_010_000 },
      providerID: "p",
      modelID: "m",
      cost: 0.001,
      tokens: { input: 10, output: 20 },
    },
    parts: [
      { type: "reasoning", text: "thinking..." },
      { type: "text", text: "Done" },
      {
        type: "tool",
        callID: "c1",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "ls" },
          output: "file.txt",
        },
      },
    ],
  },
];

const FIXTURE_TODOS: TodoLike[] = [
  { content: "Add tests", status: "in_progress" },
];

describe("OpenCodeAdapter", () => {
  it("S1 full mapping: builds a complete SessionRecord from the OpenCode client", async () => {
    const client: SessionClient = {
      get: async () => FIXTURE_SESSION,
      messages: async () => FIXTURE_MESSAGES,
      todo: async () => FIXTURE_TODOS,
    };

    const adapter = new OpenCodeAdapter(client);
    const record = await adapter.getSessionRecord("ses_1");

    assert.ok(record, "session must be found");
    assert.equal(record.id, "ses_1");
    assert.equal(record.agent, "opencode");
    assert.equal(record.title, "Demo");
    assert.equal(record.project, "C:\\work\\my-app");
    assert.equal(record.projectName, "my-app");
    assert.equal(record.createdAt, 1_723_000_000_000);
    assert.equal(record.updatedAt, 1_723_000_100_000);
    assert.equal(record.status, "completed");

    assert.equal(record.messages.length, 2);

    const user = record.messages[0]!;
    assert.equal(user.role, "user");
    assert.equal(user.text, "Fix the bug");
    assert.deepEqual(user.model, { providerID: "p", modelID: "m" });
    assert.deepEqual(user.toolCalls, []);

    const assistant = record.messages[1]!;
    assert.equal(assistant.text, "Done");
    assert.equal(assistant.reasoning, "thinking...");
    assert.equal(assistant.cost, 0.001);
    assert.deepEqual(assistant.tokens, { input: 10, output: 20 });
    assert.deepEqual(assistant.model, { providerID: "p", modelID: "m" });

    assert.equal(assistant.toolCalls.length, 1);
    const tool = assistant.toolCalls[0]!;
    assert.equal(tool.name, "bash");
    assert.equal(tool.id, "c1");
    assert.equal(tool.status, "completed");
    assert.ok(tool.input.includes("ls"), "input is a JSON string of the input");
    assert.equal(tool.output, "file.txt");

    assert.equal(record.todos.length, 1);
    assert.deepEqual(record.todos[0], {
      content: "Add tests",
      status: "in_progress",
    });

    assert.deepEqual(record.stats, {
      messages: 2,
      toolCalls: 1,
      additions: 3,
      deletions: 1,
      files: 2,
    });

    assert.deepEqual(record.tags, ["opencode", "my-app"]);
    assert.deepEqual(record.summary, {
      summary: "",
      keyConclusions: [],
      nextSteps: [],
      notes: [],
    });
  });

  it("S2 not found: `get` returning undefined yields a null record", async () => {
    const client: SessionClient = {
      get: async () => undefined,
      messages: async () => [],
      todo: async () => [],
    };

    const adapter = new OpenCodeAdapter(client);
    const record = await adapter.getSessionRecord("ses_missing");

    assert.equal(record, null);
  });

  it("S3 empty session: no messages/todos, still returns a record without throwing", async () => {
    const client: SessionClient = {
      get: async () => ({ id: "ses_3", title: "Empty" }),
      messages: async () => [],
      todo: async () => [],
    };

    const adapter = new OpenCodeAdapter(client);
    let record: SessionRecord | null | undefined;
    await assert.doesNotReject(async () => {
      record = await adapter.getSessionRecord("ses_3");
    });
    assert.ok(record);
    assert.equal(record!.id, "ses_3");
    assert.equal(record!.title, "Empty");
    assert.equal(record!.projectName, "untitled");
    assert.equal(record!.createdAt, 0);
    assert.equal(record!.updatedAt, 0);
    assert.deepEqual(record!.messages, []);
    assert.deepEqual(record!.todos, []);
    assert.deepEqual(record!.stats, {
      messages: 0,
      toolCalls: 0,
      additions: 0,
      deletions: 0,
      files: 0,
    });
  });

  it("S1b guards: messages/todo resolving to undefined default to empty arrays", async () => {
    const client: SessionClient = {
      get: async () => FIXTURE_SESSION,
      messages: async () => undefined as never,
      todo: async () => undefined as never,
    };

    const adapter = new OpenCodeAdapter(client);
    const record = await adapter.getSessionRecord("ses_1");

    assert.ok(record);
    assert.deepEqual(record!.messages, []);
    assert.deepEqual(record!.todos, []);
  });

  it("S1c normalizes POSIX directory separators on every host", async () => {
    const client: SessionClient = {
      get: async () => ({ ...FIXTURE_SESSION, directory: "/home/user/my-app" }),
      messages: async () => [],
      todo: async () => [],
    };

    const adapter = new OpenCodeAdapter(client);
    const record = await adapter.getSessionRecord("ses_1");

    assert.ok(record);
    assert.equal(record!.projectName, "my-app");
  });
});

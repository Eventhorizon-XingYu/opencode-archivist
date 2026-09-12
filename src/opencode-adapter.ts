/**
 * OpenCode adapter: maps the structural `SessionClient` surface to the
 * canonical `SessionRecord` used by the archivist pipeline.
 *
 * The adapter is intentionally SDK-free: it reads plain-object shapes that
 * mirror a subset of `@opencode-ai/sdk`, so tests supply fixtures directly
 * and a future plugin wires the real SDK client at the composition root.
 */
import { basename } from "node:path/posix";

import type {
  AgentAdapter,
  MessageRecord,
  PartLike,
  SessionClient,
  SessionMessageLike,
  SessionRecord,
  TodoLike,
  ToolCallRecord,
} from "./types.js";

/** Cap on rendered tool input/output kept in the archive (chars). */
const RENDER_LIMIT = 500;

/**
 * Return a stable project name for paths received from any host OS.
 *
 * OpenCode may provide a Windows path even when the plugin is being tested or
 * processed on Linux. Normalising both separators before taking the basename
 * keeps archive folder names consistent across platforms.
 */
export function projectNameFromDirectory(directory: string): string {
  const normalized = directory.replaceAll("\\", "/");
  return basename(normalized) || "untitled";
}

/** Truncate a rendered value so oversized tool payloads stay readable. */
function truncate(value: string, max = RENDER_LIMIT): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Map one OpenCode message (info + parts) to the canonical `MessageRecord`. */
function mapMessage(message: SessionMessageLike): MessageRecord {
  const { info, parts } = message;

  const text = parts
    .filter((part): part is Extract<PartLike, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
    .trim();
  const reasoningJoined = parts
    .filter((part): part is Extract<PartLike, { type: "reasoning" }> => part.type === "reasoning")
    .map((part) => part.text)
    .join("\n\n")
    .trim();

  const toolCalls: ToolCallRecord[] = parts
    .filter((part): part is Extract<PartLike, { type: "tool" }> => part.type === "tool")
    .map((part) => ({
      id: part.callID ?? "",
      name: part.tool,
      status: part.state?.status ?? "pending",
      input: truncate(JSON.stringify(part.state?.input ?? {})),
      output: part.state?.output ? truncate(part.state.output) : undefined,
      error: part.state?.error,
    }));

  let model: { providerID: string; modelID: string } | undefined;
  if (info.model) {
    model = info.model;
  } else if (info.providerID !== undefined || info.modelID !== undefined) {
    model = {
      providerID: info.providerID ?? "",
      modelID: info.modelID ?? "",
    };
  }

  const isAssistant = info.role === "assistant";

  return {
    id: info.id,
    role: info.role,
    time: {
      created: info.time?.created ?? 0,
      completed: info.time?.completed,
    },
    text,
    reasoning: reasoningJoined === "" ? undefined : reasoningJoined,
    toolCalls,
    model,
    cost: isAssistant ? info.cost : undefined,
    tokens:
      isAssistant && info.tokens
        ? { input: info.tokens.input ?? 0, output: info.tokens.output ?? 0 }
        : undefined,
    error: isAssistant ? info.error?.data?.message : undefined,
  };
}

/** Map one OpenCode todo to the canonical shape the summarizer consumes. */
function mapTodo(todo: TodoLike): { content: string; status: string } {
  return { content: todo.content, status: todo.status };
}

/**
 * Reads a session, its messages, and its todo list from an OpenCode client
 * and projects them onto the canonical `SessionRecord` shape.
 */
export class OpenCodeAdapter implements AgentAdapter {
  readonly name = "opencode";

  constructor(private readonly client: SessionClient) {}

  async getSessionRecord(sessionID: string): Promise<SessionRecord | null> {
    const session = await this.client.get(sessionID);
    if (!session) return null;

    const [rawMessages, rawTodos] = await Promise.all([
      this.client.messages(sessionID),
      this.client.todo(sessionID),
    ]);
    const messages = rawMessages ?? [];
    const todos = rawTodos ?? [];

    const project = session.directory ?? "";
    const projectName = projectNameFromDirectory(project);

    const mappedMessages = messages.map(mapMessage);
    const toolCallCount = mappedMessages.reduce(
      (count, message) => count + message.toolCalls.length,
      0,
    );

    return {
      id: session.id,
      agent: this.name,
      title: session.title ?? session.id,
      project,
      projectName,
      createdAt: session.time?.created ?? 0,
      updatedAt: session.time?.updated ?? 0,
      status: "completed",
      messages: mappedMessages,
      todos: todos.map(mapTodo),
      summary: {
        summary: "",
        keyConclusions: [],
        nextSteps: [],
        notes: [],
      },
      tags: ["opencode", projectName],
      stats: {
        messages: messages.length,
        toolCalls: toolCallCount,
        additions: session.summary?.additions ?? 0,
        deletions: session.summary?.deletions ?? 0,
        files: session.summary?.files ?? 0,
      },
    };
  }
}

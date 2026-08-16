/**
 * Core, agent-agnostic contracts for the archivist.
 *
 * Everything downstream (summarizer, markdown renderer, archive writer,
 * index builder) consumes these records, so a new agent (Claude Code, Cursor,
 * ...) only needs to implement an `AgentAdapter` that produces a
 * `SessionRecord`.
 *
 * This file is intentionally dependency-free: no SDK / plugin imports, no
 * runtime logic beyond type-level contracts and constants.
 */

// ---------------------------------------------------------------------------
// Canonical records (the extension seam)
// ---------------------------------------------------------------------------

export type SessionStatus = "completed" | "in_progress" | "aborted" | "unknown";

export type ToolCallStatus = "pending" | "running" | "completed" | "error";

export interface ToolCallRecord {
  /** Stable call identifier from the agent (e.g. OpenCode `callID`). */
  id: string;
  /** Tool name, e.g. `bash`, `edit`, `read`. */
  name: string;
  status: ToolCallStatus;
  /** Rendered input, JSON-stringified and truncated for readability. */
  input: string;
  /** Rendered output (truncated). Only present when `completed`. */
  output?: string;
  /** Error message. Only present when `error`. */
  error?: string;
}

export interface MessageRecord {
  id: string;
  role: "user" | "assistant";
  time: {
    /** Epoch milliseconds. */
    created: number;
    completed?: number;
  };
  /** Concatenated text parts (reasoning/tool traces kept separate). */
  text: string;
  /** Concatenated reasoning parts, if the agent exposes them. */
  reasoning?: string;
  toolCalls: ToolCallRecord[];
  model?: { providerID: string; modelID: string };
  /** Cost in USD, when the agent reports it. */
  cost?: number;
  tokens?: { input: number; output: number };
  /** Error message, when the turn ended with an error/abort. */
  error?: string;
}

export interface SummaryRecord {
  /** One-line compressed summary of what the session accomplished. */
  summary: string;
  /** What the user was trying to achieve. */
  goal?: string;
  /** Concrete conclusions / outcomes. */
  keyConclusions: string[];
  /** Follow-up work identified during the session. */
  nextSteps: string[];
  /** Caveats, open issues, or unresolved items. */
  notes: string[];
}

export interface SessionRecord {
  id: string;
  /** Adapter name / source tag, e.g. `opencode`. Also the archive subfolder. */
  agent: string;
  title: string;
  /** Full working-directory path of the session. */
  project: string;
  /** Sanitized basename of `project`, used in the folder layout. */
  projectName: string;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  messages: MessageRecord[];
  /** Task list captured from the agent (used to derive `summary.nextSteps`). */
  todos: Array<{ content: string; status: string }>;
  summary: SummaryRecord;
  tags: string[];
  stats: {
    messages: number;
    toolCalls: number;
    additions: number;
    deletions: number;
    files: number;
  };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ArchivistOptions {
  /** Absolute path to the archive root. Defaults to `~/.opencode/archive`. */
  archiveDir: string;
  /** Agent/source tag used in frontmatter and folder layout. */
  agent: string;
  /** Name of the master index file. Defaults to `index.md`. */
  indexName: string;
  /** Filename template with `{title}/{id}/{date}/{project}` placeholders. Defaults to `"{title}"`. */
  filenameTemplate: string;
  /** Port for the local settings web server. Defaults to 8866. */
  webPort: number;
  /** Whether session archiving is enabled. Defaults to `true`. */
  enabled: boolean;
}

/** The shape accepted from `opencode.json` plugin options. */
export type PartialArchivistOptions = Partial<ArchivistOptions>;

// ---------------------------------------------------------------------------
// Adapter + summarizer seams
// ---------------------------------------------------------------------------

/** Minimal adapter contract: produce a canonical record from agent state. */
export interface AgentAdapter {
  readonly name: string;
  getSessionRecord(sessionID: string): Promise<SessionRecord | null>;
}

/**
 * Summarizer seam. The default is a deterministic heuristic; a future
 * LLM-backed summarizer only needs to implement this interface.
 */
export interface Summarizer {
  readonly name: string;
  summarize(record: SessionRecord): SummaryRecord | Promise<SummaryRecord>;
}

// ---------------------------------------------------------------------------
// Structural source shapes consumed by the OpenCode adapter.
// Mirrors a subset of `@opencode-ai/sdk` so tests and future adapters can
// supply plain objects and the adapter never imports the SDK at runtime.
// ---------------------------------------------------------------------------

export interface SessionLike {
  id: string;
  title?: string;
  directory?: string;
  projectID?: string;
  time?: { created: number; updated?: number };
  summary?: { additions?: number; deletions?: number; files?: number };
}

export interface MessageLike {
  id: string;
  role: "user" | "assistant";
  time?: { created?: number; completed?: number };
  agent?: string;
  model?: { providerID: string; modelID: string };
  providerID?: string;
  modelID?: string;
  cost?: number;
  tokens?: { input?: number; output?: number };
  error?: { name?: string; data?: { message?: string } };
}

export type PartLike =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool";
      callID?: string;
      tool: string;
      state?: {
        status?: ToolCallStatus;
        input?: Record<string, unknown>;
        output?: string;
        error?: string;
      };
    }
  | { type: "file"; filename?: string }
  | { type: "step-start" }
  | { type: "step-finish"; cost?: number; tokens?: { input?: number; output?: number } }
  | { type: "snapshot" }
  | { type: "patch" }
  | { type: "agent"; name?: string }
  | { type: "retry" }
  | { type: "compaction" }
  | { type: "subtask"; prompt?: string; description?: string; agent?: string };

export interface SessionMessageLike {
  info: MessageLike;
  parts: PartLike[];
}

export interface TodoLike {
  content: string;
  status: string;
  priority?: string;
  id?: string;
}

/** Minimal client surface the OpenCode adapter reads. */
export interface SessionClient {
  get(id: string): Promise<SessionLike | undefined>;
  messages(id: string): Promise<SessionMessageLike[]>;
  todo(id: string): Promise<TodoLike[]>;
}

// ---------------------------------------------------------------------------
// Frontmatter contract
// ---------------------------------------------------------------------------

/** Flat, line-based YAML frontmatter written at the top of every session file. */
export interface Frontmatter {
  session_id: string;
  agent: string;
  title: string;
  project: string;
  project_name: string;
  date: string;
  created: string;
  updated: string;
  status: string;
  tags: string[];
  summary: string;
  goal: string;
  conclusion: string;
  next_steps: string[];
  notes: string[];
  messages: number;
  tool_calls: number;
  additions: number;
  deletions: number;
  files: number;
}

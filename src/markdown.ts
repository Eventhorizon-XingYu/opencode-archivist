/**
 * Markdown renderer for archived sessions.
 *
 * Produces a flat, line-based YAML frontmatter block (matching the
 * `Frontmatter` contract in `types.ts`) followed by a readable document:
 * H1 title, summary section, and a transcript of messages with tool calls.
 *
 * Pure and dependency-free: no `fs`, no SDK imports, no truncation (the
 * summary and tool-call payloads are pre-truncated upstream).
 */

import type { MessageRecord, SessionRecord } from "./types.js";

/** Fallback summary line used when the recorded summary is empty/blank. */
const SUMMARY_FALLBACK = "(no summary)";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Wrap a string in double quotes, escaping `\`, `"`, and newlines per YAML double-quote rules. */
function yamlQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

/** `YYYY-MM-DD` (UTC) for the given epoch milliseconds. */
function isoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/** ISO-8601 UTC string for the given epoch milliseconds. */
function isoTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function yamlStringLine(key: string, value: string): string {
  return `${key}: ${yamlQuote(value)}`;
}

function yamlArrayLine(key: string, values: string[]): string {
  const rendered = values.map(yamlQuote).join(", ");
  return `${key}: [${rendered}]`;
}

function yamlNumberLine(key: string, value: number): string {
  return `${key}: ${value}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the flat YAML frontmatter block (including the `---` delimiters)
 * for a session record. Keys exactly match the `Frontmatter` contract.
 */
export function renderFrontmatter(record: SessionRecord): string {
  const summary = record.summary.summary.trim() === "" ? SUMMARY_FALLBACK : record.summary.summary;
  const lines = [
    yamlStringLine("session_id", record.id),
    yamlStringLine("agent", record.agent),
    yamlStringLine("title", record.title),
    yamlStringLine("project", record.project),
    yamlStringLine("project_name", record.projectName),
    yamlStringLine("date", isoDate(record.createdAt)),
    yamlStringLine("created", isoTimestamp(record.createdAt)),
    yamlStringLine("updated", isoTimestamp(record.updatedAt)),
    yamlStringLine("status", record.status),
    yamlArrayLine("tags", record.tags),
    yamlStringLine("summary", summary),
    yamlStringLine("goal", record.summary.goal ?? ""),
    yamlStringLine("conclusion", record.summary.keyConclusions.join("; ")),
    yamlArrayLine("next_steps", record.summary.nextSteps),
    yamlArrayLine("notes", record.summary.notes),
    yamlNumberLine("messages", record.stats.messages),
    yamlNumberLine("tool_calls", record.stats.toolCalls),
    yamlNumberLine("additions", record.stats.additions),
    yamlNumberLine("deletions", record.stats.deletions),
    yamlNumberLine("files", record.stats.files),
  ];
  return `---\n${lines.join("\n")}\n---\n`;
}

/**
 * Render a full session document: frontmatter, H1 title, summary section,
 * and a natural-language transcript of messages (user/assistant text only —
 * tool-call payloads and reasoning are intentionally omitted so the archive
 * reads as the actual conversation).
 */
export function renderSession(record: SessionRecord): string {
  const parts: string[] = [renderFrontmatter(record).trimEnd()];
  parts.push(`# ${record.title}`);
  parts.push("## Summary");
  parts.push(...renderSummary(record));
  parts.push("## Transcript");

  // Keep only messages that carry natural-language content: a non-empty
  // `text` (the actual conversation) or an error worth surfacing. Tool-only
  // turns (empty text, tool calls only) are skipped rather than rendered as
  // empty blocks.
  const conversational = record.messages.filter(
    (message) => message.text.trim() !== "" || (message.error ?? "") !== "",
  );

  if (conversational.length === 0) {
    parts.push("_No messages._");
  } else {
    for (const message of conversational) {
      parts.push(...renderMessage(message));
    }
  }
  return `${parts.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderSummary(record: SessionRecord): string[] {
  const goal = record.summary.goal ?? "";
  const conclusions = record.summary.keyConclusions.join("; ");
  const nextSteps = record.summary.nextSteps.join("; ");
  const notes = record.summary.notes.join("; ");
  return [
    `- **Goal:** ${goal.trim() === "" ? "_none_" : goal}`,
    `- **Conclusions:** ${conclusions.trim() === "" ? "_none_" : conclusions}`,
    `- **Next steps:** ${nextSteps.trim() === "" ? "_none_" : nextSteps}`,
    `- **Notes:** ${notes.trim() === "" ? "_none_" : notes}`,
  ];
}

function renderMessage(message: MessageRecord): string[] {
  const heading = message.role === "user" ? "### User" : "### Assistant";
  const lines: string[] = [heading, `> ${isoTimestamp(message.time.created)}`];
  if (message.text.trim() !== "") {
    lines.push(message.text);
  }
  if (message.error !== undefined && message.error !== "") {
    lines.push(`**Error:** ${message.error}`);
  }
  return lines;
}

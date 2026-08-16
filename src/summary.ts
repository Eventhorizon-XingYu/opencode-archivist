/**
 * Deterministic heuristic summarizer.
 *
 * Pure and side-effect free: derives a `SummaryRecord` from the structural
 * shape of a `SessionRecord` (first user message = goal, last assistant
 * message = conclusion, open todos = next steps, message errors = notes).
 * Never throws and never calls out to an LLM.
 */

import type { MessageRecord, SessionRecord, SummaryRecord, Summarizer } from "./types.js";

/** Max length of the extracted goal excerpt. */
const GOAL_MAX = 200;
/** Max length of the extracted conclusion excerpt. */
const CONCLUSION_MAX = 500;

/** Appends a single-character ellipsis when `text` exceeds `max` chars. The result is at most `max` chars. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Collapse any whitespace run (including newlines) into a single space and
 * trim. Summary fields are rendered into single-line YAML, so multi-line
 * message text must be flattened first.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** First non-empty user message text; the session's goal. */
function extractGoal(messages: MessageRecord[]): string | undefined {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = normalize(message.text);
    if (text !== "") return truncate(text, GOAL_MAX);
  }
  return undefined;
}

/** Last non-empty assistant message text; the session's conclusion. */
function extractConclusion(messages: MessageRecord[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]!;
    if (message.role !== "assistant") continue;
    const text = normalize(message.text);
    if (text !== "") return truncate(text, CONCLUSION_MAX);
  }
  return undefined;
}

/** Open todos (pending / in_progress) become follow-up steps. */
function extractNextSteps(record: SessionRecord): string[] {
  return record.todos
    .filter((todo) => todo.status === "pending" || todo.status === "in_progress")
    .map((todo) => todo.content);
}

/** Message-level errors become caveats, one note per failing turn. */
function extractNotes(messages: MessageRecord[]): string[] {
  const notes: string[] = [];
  for (const message of messages) {
    if (message.error !== undefined) {
      notes.push(`${message.role}: ${message.error}`);
    }
  }
  return notes;
}

/**
 * Builds a compressed one-liner from the goal and conclusion excerpts,
 * e.g. `goal → conclusion`. Falls back to a placeholder when the session
 * has no conversational content worth quoting.
 */
function buildSummary(goal: string | undefined, conclusion: string | undefined): string {
  if (goal !== undefined && conclusion !== undefined) {
    return `${goal} → ${conclusion}`;
  }
  if (goal !== undefined) {
    return goal;
  }
  if (conclusion !== undefined) {
    return conclusion;
  }
  return "(no conversation content)";
}

/** Deterministic, pure, never-throwing summarization of a session record. */
export function summarizeSession(record: SessionRecord): SummaryRecord {
  const goal = extractGoal(record.messages);
  const conclusion = extractConclusion(record.messages);
  return {
    summary: buildSummary(goal, conclusion),
    goal,
    keyConclusions: conclusion !== undefined ? [conclusion] : [],
    nextSteps: extractNextSteps(record),
    notes: extractNotes(record.messages),
  };
}

/** Default summarizer: a deterministic heuristic with no external calls. */
export function createHeuristicSummarizer(): Summarizer {
  return {
    name: "heuristic",
    summarize: summarizeSession,
  };
}

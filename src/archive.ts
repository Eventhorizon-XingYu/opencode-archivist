/**
 * Archive/storage layer: sanitized path layout, session file writes, and a
 * master Markdown index rebuilt after every write.
 *
 * Layout contract: `<archiveDir>/<agent>/<projectName>/<YYYY-MM-DD>/<title>.md`
 * (the filename is the sanitized, truncated session title) plus a master
 * `<archiveDir>/<indexName>`.
 *
 * Dependency-free: `node:fs/promises` + `node:path` only.
 */

import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { join, dirname, relative } from "node:path";

import { renderFilenameTemplate } from "./template.js";
import type { ArchivistOptions, SessionRecord } from "./types.js";

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/** Windows-reserved device names (case-insensitive). */
const RESERVED_NAMES: ReadonlySet<string> = new Set(
  (() => {
    const names = ["CON", "PRN", "AUX", "NUL"];
    for (let i = 1; i <= 9; i++) {
      names.push(`COM${i}`, `LPT${i}`);
    }
    return names;
  })(),
);

/** Windows-invalid filename chars plus ASCII control chars. */
const INVALID_CHARS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

/**
 * Sanitize a single path segment so it is safe on any filesystem:
 * invalid/control chars -> `_`, whitespace runs collapsed, leading/trailing
 * dots and spaces trimmed, reserved names prefixed with `_`, empty -> "untitled".
 */
export function sanitizeSegment(segment: string): string {
  let out = segment.replace(INVALID_CHARS, "_");
  out = out.replace(/\s+/g, " ");
  out = out.replace(/^[\s.]+|[\s.]+$/g, "");
  if (RESERVED_NAMES.has(out.toUpperCase())) {
    out = `_${out}`;
  }
  return out === "" ? "untitled" : out;
}

/** Max length of a session filename stem (excluding the `.md` extension). */
export const MAX_FILENAME_CHARS = 60;

/**
 * Derive a summarizing filename stem from the session record and a filename
 * template (`{title}/{id}/{date}/{project}` placeholders). The rendered name
 * is sanitized for filesystem safety and truncated to `MAX_FILENAME_CHARS`.
 * When the template renders empty, the session id is used as a fallback.
 */
export function summarizeFilename(record: SessionRecord, template: string = "{title}"): string {
  const rendered = renderFilenameTemplate(template, record);
  const source = rendered.trim() === "" ? record.id : rendered;
  let name = sanitizeSegment(source);
  if (name.length > MAX_FILENAME_CHARS) {
    name = name.slice(0, MAX_FILENAME_CHARS).replace(/[\s.]+$/, "");
  }
  return name;
}

// ---------------------------------------------------------------------------
// Paths + writes
// ---------------------------------------------------------------------------

/**
 * Absolute path where a session's markdown will be stored, derived from the
 * record's `agent`, `projectName`, `createdAt` (UTC YYYY-MM-DD), and its
 * summarizing title-based filename.
 */
export function sessionPath(
  record: SessionRecord,
  options: ArchivistOptions,
): string {
  const date = new Date(record.createdAt).toISOString().slice(0, 10);
  return join(
    options.archiveDir,
    sanitizeSegment(record.agent),
    sanitizeSegment(record.projectName),
    date,
    `${summarizeFilename(record, options.filenameTemplate)}.md`,
  );
}

/**
 * Read the `session_id` from an existing archive file's frontmatter, or
 * `null` when the file does not exist / is unreadable (i.e. no collision).
 */
async function readSessionId(path: string): Promise<string | null> {
  try {
    const content = await readFile(path, "utf8");
    return parseFrontmatter(content).session_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Write a session's markdown at its canonical path (creating directories as
 * needed, overwriting idempotently), then refresh the master index. When a
 * different session already occupies the same title-based path, disambiguate
 * with a short id suffix to avoid silently overwriting it. Returns the path.
 */
export async function writeSession(
  record: SessionRecord,
  options: ArchivistOptions,
  markdown: string,
): Promise<string> {
  let path = sessionPath(record, options);
  const existingId = await readSessionId(path);
  if (existingId !== null && existingId !== record.id) {
    path = join(dirname(path), `${summarizeFilename(record, options.filenameTemplate)}-${record.id.slice(-8)}.md`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, markdown);
  await rebuildIndex(options);
  return path;
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/**
 * Extract the leading YAML frontmatter (between the first two `---` lines) as
 * a flat string map. Values are trimmed and surrounding double-quotes stripped.
 */
export function parseFrontmatter(markdown: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = markdown.split("\n");
  if (lines[0]?.trim() !== "---") {
    return result;
  }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim() === "---") break;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    if (key === "") continue;
    let value = line.slice(colon + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

/** Recursively collect every `*.md` file under `dir`. */
async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

interface IndexRow {
  file: string;
  fm: Record<string, string>;
  date: string;
  created: string;
}

/**
 * Rebuild `<archiveDir>/<indexName>` from every `*.md` file under `archiveDir`
 * (excluding the index itself): parse frontmatter, sort by `date` then
 * `created` descending, render a Markdown table, write it, return its path.
 */
export async function rebuildIndex(options: ArchivistOptions): Promise<string> {
  const indexPath = join(options.archiveDir, options.indexName);
  await mkdir(options.archiveDir, { recursive: true });

  const rows: IndexRow[] = [];
  for (const file of await collectMarkdownFiles(options.archiveDir)) {
    if (file === indexPath) continue;
    const fm = parseFrontmatter(await readFile(file, "utf8"));
    rows.push({
      file,
      fm,
      date: fm.date ?? "",
      created: fm.created ?? "",
    });
  }

  rows.sort(
    (a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created),
  );

  const lines = [
    "# Archive Index",
    "",
    "| Date | Project | Title | Status | Summary |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    const rel = relative(options.archiveDir, row.file).replace(/\\/g, "/");
    lines.push(
      `| ${row.date} | ${row.fm.project_name ?? ""} | [${row.fm.title ?? ""}](${rel}) | ${row.fm.status ?? ""} | ${row.fm.summary ?? ""} |`,
    );
  }

  await writeFile(indexPath, `${lines.join("\n")}\n`);
  return indexPath;
}

/**
 * Persistent, cross-process settings storage.
 *
 * OpenCode runs the server plugin and the TUI plugin in separate processes
 * with no shared in-memory store, so runtime-editable settings (archive
 * directory, filename template) live in a shared JSON file. Precedence:
 * settings file > config options > defaults.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { expandHome } from "./expand-home.js";
import type { ArchivistOptions } from "./types.js";

/** User-editable settings persisted to disk (all optional). */
export interface ArchivistSettings {
  archiveDir?: string;
  filenameTemplate?: string;
  /** Runtime field: effective web UI URL (managed by the server). */
  webUrl?: string;
  /** Whether archiving is enabled. `false` disables saving. */
  enabled?: boolean;
}

/** A partial settings patch; `null` removes a key. */
export type SettingsPatch = Partial<{
  archiveDir: string | null;
  filenameTemplate: string | null;
  webUrl: string | null;
  enabled: boolean | null;
}>;

/** Absolute path of the shared settings file. */
export function settingsPath(): string {
  return join(homedir(), ".opencode", "archivist-settings.json");
}

/**
 * Load settings from `filePath`. Returns `null` when the file is missing or
 * contains invalid JSON. Only known keys with the right value type are kept.
 */
export async function loadSettings(filePath: string): Promise<ArchivistSettings | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const settings: ArchivistSettings = {};
  if (typeof record.archiveDir === "string") settings.archiveDir = record.archiveDir;
  if (typeof record.filenameTemplate === "string") settings.filenameTemplate = record.filenameTemplate;
  if (typeof record.webUrl === "string") settings.webUrl = record.webUrl;
  if (typeof record.enabled === "boolean") settings.enabled = record.enabled;
  return settings;
}

/**
 * Apply a partial patch (a `null` value removes the key) and write atomically
 * (temp file + rename). Returns the resulting full settings object.
 */
export async function saveSettings(
  filePath: string,
  patch: SettingsPatch,
): Promise<ArchivistSettings> {
  const existing = (await loadSettings(filePath)) ?? {};
  const next: Record<string, string | boolean> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`);
  await rename(tmp, filePath);
  return next as ArchivistSettings;
}

/**
 * Merge settings over the config-provided base options. Empty/whitespace
 * string settings are ignored; `~` in `archiveDir` is expanded; `enabled`
 * defaults to the base value (true unless overridden to `false`).
 */
export function resolveEffectiveOptions(
  base: ArchivistOptions,
  settings: ArchivistSettings | null,
): ArchivistOptions {
  const archiveDir = settings?.archiveDir?.trim()
    ? expandHome(settings.archiveDir)
    : base.archiveDir;
  const filenameTemplate = settings?.filenameTemplate?.trim()
    ? settings.filenameTemplate
    : base.filenameTemplate;
  const enabled = settings?.enabled ?? base.enabled;
  return { ...base, archiveDir, filenameTemplate, enabled };
}

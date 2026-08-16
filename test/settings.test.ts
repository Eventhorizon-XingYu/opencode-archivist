import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArchivistOptions } from "../src/types.js";
import {
  loadSettings,
  resolveEffectiveOptions,
  saveSettings,
  settingsPath,
} from "../src/settings.js";

function baseOptions(): ArchivistOptions {
  return {
    archiveDir: "C:/config-archive",
    agent: "opencode",
    indexName: "index.md",
    filenameTemplate: "{title}",
    webPort: 8866,
    enabled: true,
  };
}

async function tempFile(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "arch-settings-"));
  return { path: join(dir, "settings.json"), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("T2.1 missing settings file → null", async () => {
  const { path, cleanup } = await tempFile();
  try {
    assert.equal(await loadSettings(path), null);
  } finally {
    await cleanup();
  }
});

test("T2.2 invalid JSON → null", async () => {
  const { path, cleanup } = await tempFile();
  try {
    await writeFile(path, "{ not json");
    assert.equal(await loadSettings(path), null);
  } finally {
    await cleanup();
  }
});

test("T2.3 reads only known keys and only string values", async () => {
  const { path, cleanup } = await tempFile();
  try {
    await writeFile(path, JSON.stringify({ archiveDir: "X", bogus: "y", filenameTemplate: 42 }));
    assert.deepEqual(await loadSettings(path), { archiveDir: "X" });
  } finally {
    await cleanup();
  }
});

test("T2.4 save round-trips; T2.5 null removes a key", async () => {
  const { path, cleanup } = await tempFile();
  try {
    await saveSettings(path, { archiveDir: "X", filenameTemplate: "{date}-{title}" });
    assert.deepEqual(await loadSettings(path), { archiveDir: "X", filenameTemplate: "{date}-{title}" });
    await saveSettings(path, { filenameTemplate: null });
    assert.deepEqual(await loadSettings(path), { archiveDir: "X" });
  } finally {
    await cleanup();
  }
});

test("T2.6 settings override config override defaults", () => {
  const base = baseOptions();
  const over = resolveEffectiveOptions(base, { archiveDir: "D:/settings", filenameTemplate: "{date}" });
  assert.equal(over.archiveDir, "D:/settings");
  assert.equal(over.filenameTemplate, "{date}");
  assert.equal(over.webPort, 8866);
  assert.equal(over.agent, "opencode");

  const none = resolveEffectiveOptions(base, null);
  assert.equal(none.archiveDir, "C:/config-archive");
  assert.equal(none.filenameTemplate, "{title}");
});

test("T2.7 empty/whitespace settings fall back to base", () => {
  const base = baseOptions();
  const over = resolveEffectiveOptions(base, { archiveDir: "  ", filenameTemplate: "" });
  assert.equal(over.archiveDir, base.archiveDir);
  assert.equal(over.filenameTemplate, base.filenameTemplate);
});

test("T2.8 ~ in settings archiveDir is expanded", () => {
  const over = resolveEffectiveOptions(baseOptions(), { archiveDir: "~/notes" });
  assert.equal(over.archiveDir.startsWith("~"), false);
  assert.match(over.archiveDir, /notes$/);
});

test("T2.9 settingsPath ends with .opencode/archivist-settings.json", () => {
  assert.match(settingsPath(), /\.opencode[\\/]archivist-settings\.json$/);
});

test("T2.10 loadSettings reads a boolean enabled (ignores non-boolean)", async () => {
  const { path, cleanup } = await tempFile();
  try {
    await writeFile(path, JSON.stringify({ enabled: false, archiveDir: "X", enabledBad: "false" }));
    assert.deepEqual(await loadSettings(path), { archiveDir: "X", enabled: false });
  } finally {
    await cleanup();
  }
});

test("T2.11 saveSettings round-trips boolean enabled; null removes it", async () => {
  const { path, cleanup } = await tempFile();
  try {
    await saveSettings(path, { enabled: false });
    assert.deepEqual(await loadSettings(path), { enabled: false });
    await saveSettings(path, { enabled: true });
    assert.equal((await loadSettings(path))?.enabled, true);
    await saveSettings(path, { enabled: null });
    assert.deepEqual(await loadSettings(path), {});
  } finally {
    await cleanup();
  }
});

test("T2.12 resolveEffectiveOptions merges enabled (settings false overrides, absent defaults to base)", () => {
  const base = baseOptions();
  assert.equal(resolveEffectiveOptions(base, { enabled: false }).enabled, false);
  assert.equal(resolveEffectiveOptions(base, { enabled: true }).enabled, true);
  assert.equal(resolveEffectiveOptions(base, null).enabled, true);
  assert.equal(resolveEffectiveOptions(base, {}).enabled, true);
});

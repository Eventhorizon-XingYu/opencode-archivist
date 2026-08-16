import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArchivistOptions } from "../src/types.js";
import { createArchivistServer } from "../src/web/server.js";

const PAGE = "<!doctype html><title>Archivist Settings</title><body>settings</body>";

interface SettingsResponse {
  settings: Record<string, string | boolean>;
  effective: { archiveDir: string; filenameTemplate: string; enabled: boolean };
  sources: { archiveDir: string; filenameTemplate: string; enabled: string };
}

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

async function tempSettings(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "arch-web-"));
  return { path: join(dir, "settings.json"), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("T3.1 GET / serves the page", async (t) => {
  const { path, cleanup } = await tempSettings();
  const server = await createArchivistServer({ settingsPath: path, baseOptions: baseOptions(), pageHtml: PAGE, port: 0 });
  t.after(async () => { await server.close(); await cleanup(); });
  const res = await fetch(`${server.url}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await res.text(), /Archivist Settings/);
});

test("T3.2 /api/health returns the service marker", async (t) => {
  const { path, cleanup } = await tempSettings();
  const server = await createArchivistServer({ settingsPath: path, baseOptions: baseOptions(), pageHtml: PAGE, port: 0 });
  t.after(async () => { await server.close(); await cleanup(); });
  const res = await fetch(`${server.url}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { service: "opencode-archivist" });
});

test("T3.3 GET /api/settings returns effective defaults with sources", async (t) => {
  const { path, cleanup } = await tempSettings();
  const server = await createArchivistServer({ settingsPath: path, baseOptions: baseOptions(), pageHtml: PAGE, port: 0 });
  t.after(async () => { await server.close(); await cleanup(); });
  const res = await fetch(`${server.url}/api/settings`);
  const body = (await res.json()) as SettingsResponse;
  assert.equal(res.status, 200);
  assert.equal(body.effective.archiveDir, "C:/config-archive");
  assert.equal(body.effective.filenameTemplate, "{title}");
  assert.equal(body.sources.archiveDir, "config");
});

test("T3.4 PUT persists settings and returns updated effective", async (t) => {
  const { path, cleanup } = await tempSettings();
  const server = await createArchivistServer({ settingsPath: path, baseOptions: baseOptions(), pageHtml: PAGE, port: 0 });
  t.after(async () => { await server.close(); await cleanup(); });
  const res = await fetch(`${server.url}/api/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ archiveDir: "D:/overridden", filenameTemplate: "{date}-{title}" }),
  });
  const body = (await res.json()) as SettingsResponse;
  assert.equal(res.status, 200);
  assert.equal(body.effective.archiveDir, "D:/overridden");
  assert.equal(body.effective.filenameTemplate, "{date}-{title}");
  assert.equal(body.sources.archiveDir, "settings");
  // persisted to disk
  const onDisk = JSON.parse(await readFile(path, "utf8"));
  assert.equal(onDisk.archiveDir, "D:/overridden");
});

test("T3.5 PUT with a non-string value → 400", async (t) => {
  const { path, cleanup } = await tempSettings();
  const server = await createArchivistServer({ settingsPath: path, baseOptions: baseOptions(), pageHtml: PAGE, port: 0 });
  t.after(async () => { await server.close(); await cleanup(); });
  const res = await fetch(`${server.url}/api/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ archiveDir: 42 }),
  });
  assert.equal(res.status, 400);
});

test("T3.6 /api/preview renders a filename from a template", async (t) => {
  const { path, cleanup } = await tempSettings();
  const server = await createArchivistServer({ settingsPath: path, baseOptions: baseOptions(), pageHtml: PAGE, port: 0 });
  t.after(async () => { await server.close(); await cleanup(); });
  const res = await fetch(`${server.url}/api/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template: "{date}-{title}" }),
  });
  const body = (await res.json()) as { filename: string };
  assert.equal(res.status, 200);
  assert.match(body.filename, /^\d{4}-\d{2}-\d{2}-/);
});

test("T3.7 close() stops the server", async () => {
  const { path, cleanup } = await tempSettings();
  const server = await createArchivistServer({ settingsPath: path, baseOptions: baseOptions(), pageHtml: PAGE, port: 0 });
  const url = server.url;
  await server.close();
  await cleanup();
  await assert.rejects(fetch(`${url}/api/health`));
});

test("T3.8 unknown route → 404", async (t) => {
  const { path, cleanup } = await tempSettings();
  const server = await createArchivistServer({ settingsPath: path, baseOptions: baseOptions(), pageHtml: PAGE, port: 0 });
  t.after(async () => { await server.close(); await cleanup(); });
  const res = await fetch(`${server.url}/api/nope`);
  assert.equal(res.status, 404);
});

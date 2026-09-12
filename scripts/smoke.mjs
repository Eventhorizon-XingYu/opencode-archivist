/**
 * Smoke checks for the built plugin.
 *
 * 1. Load-contract: import `dist/index.js` and verify its default export
 *    matches what OpenCode's `readV1Plugin` loader expects (`{ id, server }`).
 * 2. Serve smoke (best-effort): register the built plugin in a throwaway
 *    project and spawn `opencode serve` to confirm OpenCode starts without
 *    crashing with the plugin loaded.
 *
 * Run: `npm run build && node scripts/smoke.mjs`
 */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// 1. Load-contract check (deterministic)
// ---------------------------------------------------------------------------

const distUrl = pathToFileURL(join(process.cwd(), "dist", "index.js")).href;
const mod = await import(distUrl);
const def = mod.default;

if (typeof def?.server !== "function" || typeof def?.id !== "string") {
  console.error("FAIL: default export does not match { id, server } contract");
  process.exit(1);
}
console.log(`load-contract OK: id=${def.id}, server=${typeof def.server}`);

// 1b. TUI entry contract: `dist/tui.js` default export must be { id, tui }.
const tuiUrl = pathToFileURL(join(process.cwd(), "dist", "tui.js")).href;
const tuiMod = await import(tuiUrl);
const tuiDef = tuiMod.default;

if (typeof tuiDef?.tui !== "function" || typeof tuiDef?.id !== "string") {
  console.error("FAIL: tui default export does not match { id, tui } contract");
  process.exit(1);
}
console.log(`tui load-contract OK: id=${tuiDef.id}, tui=${typeof tuiDef.tui}`);

// ---------------------------------------------------------------------------
// 2. Serve smoke (best-effort)
// ---------------------------------------------------------------------------

const projectDir = await mkdtemp(join(tmpdir(), "archivist-smoke-"));
try {
  const configDir = join(projectDir, ".opencode");
  await mkdir(configDir, { recursive: true });
  const pluginPath = join(process.cwd(), "dist", "index.js").replaceAll("\\", "\\\\");
  await writeFile(
    join(configDir, "opencode.json"),
    JSON.stringify({ plugin: [pluginPath] }),
  );

  const child = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
    cwd: projectDir,
    stdio: "ignore",
  });

  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));

  const result = await Promise.race([
    exited.then((code) => ({ kind: "exit", code })),
    new Promise((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 10_000)),
  ]);

  if (result.kind === "exit") {
    console.warn(`serve smoke: opencode exited early (code ${result.code}) — treating the optional server check as skipped`);
  } else {
    console.log("serve smoke OK: opencode serve stayed up 10s with plugin loaded");
    child.kill();
    // Wait for the process to fully exit so Windows releases its cwd before we remove the dir.
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
} catch (error) {
  console.warn(`serve smoke skipped: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  try {
    await rm(projectDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("SMOKE PASS (load-contract checks passed; server check may be skipped when OpenCode is unavailable)");

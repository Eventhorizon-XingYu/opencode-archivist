/**
 * Plugin entry point.
 *
 * OpenCode loads this module as `export default { server }` (see the official
 * `readV1Plugin` loader). The `server` function wires an `event` hook that
 * listens for `session.idle` and archives the finished turn via the
 * canonical pipeline: OpenCodeAdapter → heuristic summarizer → markdown
 * renderer → archive writer (which also rebuilds `index.md`).
 *
 * The adapter seam (`SessionClient`) keeps this file free of runtime SDK
 * imports; only types are borrowed from `@opencode-ai/plugin`.
 */

import { homedir } from "node:os";
import { join } from "node:path";

import type { Plugin, PluginInput, PluginModule } from "@opencode-ai/plugin";

import { expandHome } from "./expand-home.js";
import { OpenCodeAdapter } from "./opencode-adapter.js";
import { renderSession } from "./markdown.js";
import { createHeuristicSummarizer } from "./summary.js";
import { writeSession } from "./archive.js";
import { loadSettings, resolveEffectiveOptions, saveSettings, settingsPath } from "./settings.js";
import { startWebServer, type ArchivistServer } from "./web/server.js";
import { WEB_PAGE_HTML } from "./web/page.js";

import type {
  ArchivistOptions,
  PartialArchivistOptions,
  SessionClient,
} from "./types.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Resolve plugin options to a full `ArchivistOptions`. Defaults to
 * `<homedir>/.opencode/archive` so sessions land in one central, versionable
 * location regardless of which project you are working in.
 */
export function resolveOptions(partial?: PartialArchivistOptions): ArchivistOptions {
  return {
    archiveDir: partial?.archiveDir
      ? expandHome(partial.archiveDir)
      : join(homedir(), ".opencode", "archive"),
    agent: partial?.agent ?? "opencode",
    indexName: partial?.indexName ?? "index.md",
    filenameTemplate: partial?.filenameTemplate ?? "{title}",
    webPort: partial?.webPort ?? 8866,
    enabled: partial?.enabled ?? true,
  };
}

// ---------------------------------------------------------------------------
// Client adaptation (SDK client -> structural SessionClient)
// ---------------------------------------------------------------------------

/** Adapt the real OpenCode SDK client to the structural `SessionClient`. */
function createClient(input: PluginInput): SessionClient {
  return {
    get: async (id) => (await input.client.session.get({ path: { id } })).data,
    messages: async (id) =>
      (await input.client.session.messages({ path: { id } })).data ?? [],
    todo: async (id) =>
      (await input.client.session.todo({ path: { id } })).data ?? [],
  };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Archive a single session: capture → summarize → render → write (+ index
 * rebuild). Returns the written file path, or `null` if the session no
 * longer exists. Throws are the caller's responsibility (the plugin swallows
 * them so a failure never crashes OpenCode).
 */
export async function archiveSession(
  client: SessionClient,
  sessionID: string,
  opts: ArchivistOptions,
): Promise<string | null> {
  const record = await new OpenCodeAdapter(client).getSessionRecord(sessionID);
  if (record === null) return null;
  record.summary = await createHeuristicSummarizer().summarize(record);
  return writeSession(record, opts, renderSession(record));
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const server: Plugin = async (input: PluginInput, options?: PartialArchivistOptions) => {
  const opts = resolveOptions(options);
  const client = createClient(input);
  const settingsFile = settingsPath();

  // Start the settings web server (best-effort: archiving must never depend
  // on it). Persist its effective URL so the TUI entry can discover it.
  let web: ArchivistServer | null = null;
  try {
    web = await startWebServer({ settingsPath: settingsFile, baseOptions: opts, pageHtml: WEB_PAGE_HTML });
    if (web.ownsServer) {
      await saveSettings(settingsFile, { webUrl: web.url });
    }
  } catch (error) {
    console.error("[opencode-archivist] failed to start web server:", error);
  }

  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return;
      try {
        // Re-read runtime settings each idle so web-UI edits take effect on
        // the very next archive without restarting OpenCode.
        const effective = resolveEffectiveOptions(opts, await loadSettings(settingsFile));
        if (effective.enabled === false) return; // saving disabled
        await archiveSession(client, event.properties.sessionID, effective);
      } catch (error) {
        console.error(
          `[opencode-archivist] failed to archive session ${event.properties.sessionID}:`,
          error,
        );
      }
    },
    dispose: async () => {
      if (web?.ownsServer) await web.close();
    },
  };
};

export default { id: "opencode-archivist", server } satisfies PluginModule;

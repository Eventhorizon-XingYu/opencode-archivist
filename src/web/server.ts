/**
 * Local settings web server.
 *
 * Serves a self-contained settings page plus a small JSON API for reading and
 * writing runtime settings (archive dir + filename template). Loopback-only;
 * resilient to multiple simultaneous OpenCode instances via adopt-or-ephemeral
 * port handling.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { summarizeFilename } from "../archive.js";
import {
  loadSettings,
  resolveEffectiveOptions,
  saveSettings,
  type ArchivistSettings,
  type SettingsPatch,
} from "../settings.js";
import type { ArchivistOptions, SessionRecord } from "../types.js";

export interface ArchivistServer {
  url: string;
  port: number;
  close(): Promise<void>;
  ownsServer: boolean;
}

export interface CreateServerOptions {
  settingsPath: string;
  baseOptions: ArchivistOptions;
  pageHtml: string;
  port?: number;
  host?: string;
}

/** Representative record used to render the `/api/preview` filename. */
const SAMPLE_RECORD: SessionRecord = {
  id: "ses_sample123",
  agent: "opencode",
  title: "示例会话标题",
  project: "/home/dev/sample",
  projectName: "sample-project",
  createdAt: Date.UTC(2026, 0, 15, 10, 30, 0),
  updatedAt: Date.UTC(2026, 0, 15, 10, 30, 0),
  status: "completed",
  messages: [],
  todos: [],
  summary: { summary: "", keyConclusions: [], nextSteps: [], notes: [] },
  tags: [],
  stats: { messages: 0, toolCalls: 0, additions: 0, deletions: 0, files: 0 },
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildSettingsResponse(baseOptions: ArchivistOptions, settings: ArchivistSettings | null) {
  const effective = resolveEffectiveOptions(baseOptions, settings);
  const sources = {
    archiveDir: settings?.archiveDir?.trim() ? "settings" : "config",
    filenameTemplate: settings?.filenameTemplate?.trim() ? "settings" : "config",
    enabled: settings?.enabled !== undefined ? "settings" : "config",
  };
  return {
    settings: settings ?? {},
    effective: {
      archiveDir: effective.archiveDir,
      filenameTemplate: effective.filenameTemplate,
      enabled: effective.enabled,
    },
    sources,
  };
}

/** Create and start an HTTP server bound to `opts.port` (0 = ephemeral). */
export async function createArchivistServer(opts: CreateServerOptions): Promise<ArchivistServer> {
  const host = opts.host ?? "127.0.0.1";
  const { settingsPath, baseOptions, pageHtml } = opts;

  const server: Server = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      console.error("[opencode-archivist] web request failed:", error);
      json(res, 500, { error: "internal error" });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${host}`);
    const method = req.method ?? "GET";
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(pageHtml);
      return;
    }
    if (method === "GET" && pathname === "/api/health") {
      json(res, 200, { service: "opencode-archivist" });
      return;
    }
    if (method === "GET" && pathname === "/api/settings") {
      json(res, 200, buildSettingsResponse(baseOptions, await loadSettings(settingsPath)));
      return;
    }
    if (method === "PUT" && pathname === "/api/settings") {
      const body = await readBody(req);
      if (typeof body !== "object" || body === null) {
        json(res, 400, { error: "invalid JSON body" });
        return;
      }
      const raw = body as Record<string, unknown>;
      const patch: SettingsPatch = {};
      for (const key of ["archiveDir", "filenameTemplate"] as const) {
        if (!(key in raw)) continue;
        const value = raw[key];
        if (value === null) {
          patch[key] = null;
        } else if (typeof value === "string" && value.trim() !== "") {
          patch[key] = value;
        } else {
          json(res, 400, { error: `${key} must be a non-empty string or null` });
          return;
        }
      }
      if ("enabled" in raw) {
        const value = raw.enabled;
        if (value === null || typeof value === "boolean") {
          patch.enabled = value;
        } else {
          json(res, 400, { error: "enabled must be a boolean or null" });
          return;
        }
      }
      const settings = await saveSettings(settingsPath, patch);
      json(res, 200, buildSettingsResponse(baseOptions, settings));
      return;
    }
    if (method === "POST" && pathname === "/api/preview") {
      const body = await readBody(req);
      const template =
        typeof body === "object" && body !== null
          ? (body as Record<string, unknown>).template
          : undefined;
      if (typeof template !== "string") {
        json(res, 400, { error: "template must be a string" });
        return;
      }
      json(res, 200, { filename: summarizeFilename(SAMPLE_RECORD, template) });
      return;
    }
    json(res, 404, { error: "not found" });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("unexpected server address");
  }

  return {
    url: `http://${host}:${address.port}`,
    port: address.port,
    ownsServer: true,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export interface StartWebServerOptions {
  settingsPath: string;
  baseOptions: ArchivistOptions;
  pageHtml: string;
  host?: string;
}

/**
 * Start the web server on `baseOptions.webPort`, adopting an existing instance
 * if one is already serving our service marker, else falling back to an
 * ephemeral port.
 */
export async function startWebServer(opts: StartWebServerOptions): Promise<ArchivistServer> {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.baseOptions.webPort;
  try {
    return await createArchivistServer({ ...opts, host, port });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    try {
      const res = await fetch(`http://${host}:${port}/api/health`);
      const body = (await res.json()) as { service?: string };
      if (body.service === "opencode-archivist") {
        return { url: `http://${host}:${port}`, port, ownsServer: false, close: async () => {} };
      }
    } catch {
      // not our service; fall through to ephemeral
    }
    return await createArchivistServer({ ...opts, host, port: 0 });
  }
}

/**
 * TUI plugin entry: registers a palette command that opens the settings web
 * UI in the browser.
 *
 * OpenCode loads this module via the package's `"./tui"` export in the TUI
 * process (the server entry lives in `./index.ts`). A single module cannot
 * export both `server` and `tui`, so the two entrypoints are separate files.
 */

import { spawn } from "node:child_process";

import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";

import { loadSettings, settingsPath, type ArchivistSettings } from "./settings.js";

/** Resolve the web UI URL, preferring the server-persisted value. */
export function resolveWebUrl(settings: ArchivistSettings | null): string {
  return settings?.webUrl?.trim() ? settings.webUrl : "http://127.0.0.1:8866";
}

/** Build a platform-appropriate command to open a URL in the default browser. */
export function buildOpenCommand(
  platform: NodeJS.Platform,
  url: string,
): { cmd: string; args: string[] } {
  if (platform === "win32") return { cmd: "cmd", args: ["/c", "start", "", url] };
  if (platform === "darwin") return { cmd: "open", args: [url] };
  return { cmd: "xdg-open", args: [url] };
}

/** Open a URL in the default browser (fire-and-forget). */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const { cmd, args } = buildOpenCommand(platform, url);
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

/** The TUI plugin: a palette command to open the settings web UI. */
export const tui: TuiPlugin = async (api) => {
  const settingsFile = settingsPath();

  api.keymap.registerLayer({
    commands: [
      {
        name: "archivist.settings.open",
        title: "Archivist: 打开设置",
        category: "Archivist",
        namespace: "palette",
        run: async () => {
          const settings = await loadSettings(settingsFile);
          const url = resolveWebUrl(settings);
          api.ui.toast({
            variant: "info",
            title: "opencode-archivist",
            message: `正在打开设置页面: ${url}`,
          });
          openBrowser(url);
        },
      },
    ],
  });
};

export default { id: "opencode-archivist", tui } satisfies TuiPluginModule;

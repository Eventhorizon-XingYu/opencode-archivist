import { test } from "node:test";
import assert from "node:assert/strict";

import pluginDefault, { buildOpenCommand, resolveWebUrl } from "../src/tui.js";

test("T6.1 buildOpenCommand picks the platform command", () => {
  assert.deepEqual(buildOpenCommand("win32", "http://x"), {
    cmd: "cmd",
    args: ["/c", "start", "", "http://x"],
  });
  assert.deepEqual(buildOpenCommand("darwin", "http://x"), { cmd: "open", args: ["http://x"] });
  assert.deepEqual(buildOpenCommand("linux", "http://x"), { cmd: "xdg-open", args: ["http://x"] });
});

test("T6.2 resolveWebUrl prefers the persisted URL, falls back to default", () => {
  assert.equal(resolveWebUrl(null), "http://127.0.0.1:8866");
  assert.equal(resolveWebUrl({}), "http://127.0.0.1:8866");
  assert.equal(resolveWebUrl({ webUrl: "http://127.0.0.1:9999" }), "http://127.0.0.1:9999");
  assert.equal(resolveWebUrl({ webUrl: "   " }), "http://127.0.0.1:8866");
});

test("T6.3 default export is a tui plugin module (id + tui fn)", () => {
  assert.equal(pluginDefault.id, "opencode-archivist");
  assert.equal(typeof pluginDefault.tui, "function");
  assert.equal("server" in pluginDefault, false);
});

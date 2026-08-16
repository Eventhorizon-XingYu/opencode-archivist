import { test } from "node:test";
import assert from "node:assert/strict";

import { WEB_PAGE_HTML } from "../src/web/page.js";

const page = WEB_PAGE_HTML;

test("W1 page is fully self-contained (no external resources)", () => {
  assert.match(page, /^<!doctype html>/i);
  assert.doesNotMatch(page, /https?:\/\//, "no http(s):// URLs anywhere");
  assert.doesNotMatch(page, /<script[^>]*\bsrc\s*=/i, "no external scripts");
  assert.doesNotMatch(page, /<link[^>]*\bhref\s*=/i, "no external stylesheets");
});

test("W2 page has the required controls", () => {
  assert.match(page, /id="archiveDir"/);
  assert.match(page, /id="filenameTemplate"/);
  assert.match(page, /id="filenamePreview"/);
  assert.match(page, /id="saveBtn"/);
  assert.match(page, /id="resetBtn"/);
  assert.match(page, /id="enabled"/);
  assert.match(page, /id="enabledBadge"/);
  assert.match(page, /role="switch"/);
});

test("W3 page ships an insert chip for every placeholder", () => {
  for (const ph of ["{title}", "{id}", "{date}", "{project}"]) {
    assert.ok(page.includes(ph), `missing placeholder token ${ph}`);
  }
  for (const ph of ["title", "id", "date", "project"]) {
    assert.match(page, new RegExp(`data-ph="\\{${ph}\\}"`), `missing chip for {${ph}}`);
  }
});

test("W4 page has a non-empty title and zh-CN language", () => {
  const title = page.match(/<title>([\s\S]*?)<\/title>/);
  assert.ok(title !== null && title[1] !== undefined, "no <title> tag");
  assert.ok(title[1].trim() !== "", "title must not be empty");
  assert.match(page, /lang="zh-CN"/);
});

test("W5 embedded JS avoids template-literal hazards", () => {
  // The page ships inside a backtick template literal in page.ts, so embedded
  // JS must never contain backticks or ${...}.
  assert.ok(!page.includes("${"), "embedded JS must not use ${");
  assert.equal((page.match(/`/g) ?? []).length, 0, "no backticks inside the page");
});

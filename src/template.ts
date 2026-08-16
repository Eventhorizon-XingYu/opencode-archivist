/**
 * Filename template rendering.
 *
 * A filename template is a string with `{placeholder}` tokens substituted
 * from a `SessionRecord`. Unknown tokens are left literal so a user's typo is
 * visible in the resulting name rather than silently dropped.
 */

import type { SessionRecord } from "./types.js";

/** Placeholders understood by the template renderer. */
export const FILENAME_PLACEHOLDERS = ["{title}", "{id}", "{date}", "{project}"] as const;

/** The title when it names the session; otherwise the session id. */
function effectiveTitle(record: SessionRecord): string {
  return record.title !== "" && record.title !== record.id ? record.title : record.id;
}

/** Substitute every placeholder in `template` with the record's values. */
export function renderFilenameTemplate(template: string, record: SessionRecord): string {
  const date = new Date(record.createdAt).toISOString().slice(0, 10);
  return template
    .replaceAll("{title}", effectiveTitle(record))
    .replaceAll("{id}", record.id)
    .replaceAll("{date}", date)
    .replaceAll("{project}", record.projectName);
}

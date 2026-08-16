import { homedir } from "node:os";

/** Expand a leading `~` (or `~\`) to the user's home directory. */
export function expandHome(path: string): string {
  return path.replace(/^~(?=$|[\\/])/, homedir());
}

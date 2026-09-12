import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const testDirectory = join(process.cwd(), "test");
const testFiles = (await readdir(testDirectory))
  .filter((file) => file.endsWith(".test.ts"))
  .sort()
  .map((file) => join(testDirectory, file));

if (testFiles.length === 0) {
  throw new Error(`No test files found in ${testDirectory}`);
}

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  { cwd: process.cwd(), stdio: "inherit" },
);

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Test runner terminated by ${signal}`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});

import { $ } from "bun";
import { existsSync } from "fs";
import { join, dirname } from "path";
import type { CastFile, CastEvent } from "./cast.js";
import { parseCast } from "./cast.js";

const HELPER_SRC = join(dirname(import.meta.dir), "src", "pty-helper.c");
const HELPER_BIN = join(dirname(import.meta.dir), "src", "pty-helper");

/**
 * Ensure the PTY helper binary is compiled.
 */
async function ensureHelper(): Promise<string> {
  if (existsSync(HELPER_BIN)) return HELPER_BIN;

  console.log("  Compiling PTY helper...");
  try {
    await $`gcc -O2 -o ${HELPER_BIN} ${HELPER_SRC}`.quiet();
  } catch (err: any) {
    throw new Error(
      `Failed to compile PTY helper. Make sure gcc is installed.\n${err.stderr?.toString() ?? err}`
    );
  }
  return HELPER_BIN;
}

/**
 * Record a terminal session using our native PTY helper.
 * Returns an asciicast v2 CastFile.
 */
export async function record(opts: {
  cols?: number;
  rows?: number;
  shell?: string;
}): Promise<CastFile> {
  const helper = await ensureHelper();
  const cols = opts.cols ?? parseInt(process.env.COLUMNS ?? "80");
  const rows = opts.rows ?? parseInt(process.env.LINES ?? "24");
  const shell = opts.shell ?? process.env.SHELL ?? "/bin/bash";

  const castFile = `/tmp/termsnap-${Date.now()}.cast`;

  console.log(
    `\x1b[1m  Recording...\x1b[0m (type \x1b[1mexit\x1b[0m or press \x1b[1mCtrl+D\x1b[0m to stop)\n`
  );

  const proc = Bun.spawn(
    [helper, String(cols), String(rows), shell, castFile],
    {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }
  );

  await proc.exited;

  console.log(`\n\x1b[1m  Recording saved!\x1b[0m`);

  // Read the cast file
  const file = Bun.file(castFile);
  if (!(await file.exists())) {
    throw new Error("Recording failed — no output captured.");
  }

  const content = await file.text();
  const cast = parseCast(content);

  // Cleanup
  try { await $`rm -f ${castFile}`.quiet(); } catch {}

  return cast;
}

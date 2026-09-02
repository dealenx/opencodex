/**
 * Generate gui/dist/build-info.json at build time — a small provenance file describing
 * when and from what the shipped artifacts were built. Served by the proxy's static
 * handler at GET /build-info.json. Informational only; nothing in the runtime path
 * reads it.
 *
 * Resolution order for fields:
 * - commit/message: git (works in dev and CI checkouts), else BUILD_* env, else "unknown"
 * - built_at: wall clock at generation time
 *
 * Run directly: bun scripts/generate-build-info.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(new URL(import.meta.url))), "..");
const outPath = join(root, "gui", "dist", "build-info.json");

function git(args: string[], fallback: string): string {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

const commit = env(
  "BUILD_COMMIT",
  git(["rev-parse", "HEAD"], "unknown"),
);
const commitShort = commit === "unknown" ? "unknown" : commit.slice(0, 7);
const message = env(
  "BUILD_MESSAGE",
  commit === "unknown" ? "" : git(["log", "-1", "--pretty=%s"], ""),
);
const now = new Date();
const unix = Math.floor(now.getTime() / 1000);
const nsk = new Date(now.getTime() + 7 * 3600 * 1000);

const info = {
  service: "opencodex",
  commit,
  commit_short: commitShort,
  message,
  built_at: `${now.toISOString().slice(0, 19).replace("T", " ")} UTC`,
  built_at_unix: unix,
  built_at_nsk: `${nsk.toISOString().slice(0, 19).replace("T", " ")} +07`,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(info, null, 2)}\n`);
console.log(`[build-info] wrote ${outPath} (commit: ${commitShort})`);
if (!existsSync(join(root, "gui", "dist", "index.html"))) {
  console.log("[build-info] note: gui/dist has no index.html yet; run build:gui for the dashboard");
}
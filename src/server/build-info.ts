import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../config";
/**
 * Build provenance for the running proxy. Resolution order:
 * 1. `$OPENCODEX_HOME/build-info.json` (written into the volume by image builds via
 *    `scripts/generate-build-info.ts` — survives container restarts and identifies the
 *    image the container is actually running, not whatever file a stale mount carries).
 * 2. `gui/dist/build-info.json` next to the packaged dashboard build.
 * 3. `$BUILD_COMMIT` / `$BUILD_MESSAGE` environment overrides.
 * 4. Unknown — dev checkouts without a build step.
 *
 * Read fresh on every call: `/build-info.json` must reflect the files on disk at request
 * time, not a snapshot taken at module load.
 */
export function readBuildInfo(): Record<string, unknown> | null {
  const candidates: string[] = [
    join(getConfigDir(), "build-info.json"),
    join(import.meta.dir, "..", "..", "gui", "dist", "build-info.json"),
  ];

  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* missing or malformed — try the next candidate */
    }
  }

  const commit = process.env.BUILD_COMMIT?.trim();
  if (commit) {
    return {
      service: "opencodex",
      commit,
      commit_short: commit.slice(0, 7),
      message: process.env.BUILD_MESSAGE?.trim() ?? "",
      built_at: "unknown",
      built_at_unix: null,
      built_at_nsk: "unknown",
      source: "environment",
    };
  }
  return null;
}
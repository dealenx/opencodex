import { chmodSync, existsSync, lstatSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCompatibilityVersionManifest } from "./generate-compatibility-version";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function applyMode(path: string, mode: number): void {
  try { chmodSync(path, mode); } catch { /* best-effort for read-only filesystems */ }
}

function chmodIfRegularEntry(path: string, mode: number): void {
  if (!existsSync(path)) return;
  const st = lstatSync(path);
  if (st.isSymbolicLink()) return;
  applyMode(path, mode);
}

function chmodTree(path: string): void {
  if (!existsSync(path)) return;
  const st = lstatSync(path);
  if (st.isSymbolicLink()) return;
  if (st.isDirectory()) {
    applyMode(path, 0o755);
    for (const entry of readdirSync(path)) chmodTree(join(path, entry));
    return;
  }
  applyMode(path, 0o644);
}

export function normalizePackageModes(packageRoot: string): void {
  chmodIfRegularEntry(join(packageRoot, "bin", "ocx.mjs"), 0o755);
  chmodIfRegularEntry(join(packageRoot, "bin", "package-main.mjs"), 0o644);
  chmodTree(join(packageRoot, "gui", "dist"));
}

// Generate the exact CL-00 implementation manifest immediately before package
// assembly. The output stays untracked to avoid a self-referential digest, but
// package.json already ships src/** so the generated artifact is embedded.
if (import.meta.main) {
  // The manifest hashes git-tracked bytes via `git ls-files`. A Docker/Nixpacks build
  // context has no .git, and the shipped proxy does not read the generated manifest for
  // routing decisions it cannot already make — skip generation there instead of failing
  // the whole build. Packaged installs (npm pack / release pipeline) always have .git.
  try {
    generateCompatibilityVersionManifest(root);
  } catch (error) {
    console.warn(
      "[prepare-package] skipping compatibility manifest:",
      error instanceof Error ? error.message : String(error),
    );
  }
  normalizePackageModes(root);
}

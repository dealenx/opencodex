/**
 * Container boot seed for Nixpacks deployments (nixpacks.toml [start]).
 *
 * The proxy binds 127.0.0.1 unless config.json carries "hostname": "0.0.0.0"
 * (src/server/index.ts canonicalizes an absent hostname to loopback). A loopback
 * bind inside a container is unreachable through the platform's edge proxy, which
 * surfaces as a permanent 502 behind a perfectly healthy start.
 *
 * Idempotent by contract: the wildcard host is added only when the parsed config
 * has NO hostname key at all, so an operator's explicit choice — including an
 * intentional loopback bind — is never overwritten. Never throws: a failed seed
 * must not block the proxy from starting.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const home = process.env.OPENCODEX_HOME?.trim()
  || (process.env.HOME?.trim() ? join(process.env.HOME.trim(), ".opencodex") : "");

if (!home) {
  console.log("[seed-container-config] no OPENCODEX_HOME or HOME; nothing to seed");
  process.exit(0);
}
const configPath = join(home, "config.json");

try {
  if (!existsSync(configPath)) {
    console.log(`[seed-container-config] no config at ${configPath}; the proxy will create one — nothing to seed`);
    process.exit(0);
  }
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn(`[seed-container-config] ${configPath} is not a JSON object; skipping`);
    process.exit(0);
  }
  if (Object.hasOwn(parsed, "hostname")) {
    console.log(`[seed-container-config] ${configPath} already declares a hostname; leaving it untouched`);
    process.exit(0);
  }
  parsed.hostname = "0.0.0.0";
  writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(`[seed-container-config] added "hostname": "0.0.0.0" to ${configPath}`);
} catch (error) {
  console.warn(`[seed-container-config] skipped: ${error instanceof Error ? error.message : String(error)}`);
}
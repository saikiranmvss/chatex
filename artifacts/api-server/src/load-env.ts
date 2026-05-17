import { existsSync } from "node:fs";
import { config } from "dotenv";
import path from "node:path";

function findEnvFile(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const envPath = findEnvFile();
if (envPath) {
  config({ path: envPath, override: true });
}

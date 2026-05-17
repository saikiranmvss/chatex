import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Persists uploaded chat media next to the api-server package (survives dist rebuilds). */
export const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

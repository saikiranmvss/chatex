import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env"), override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Ensure .env is configured.");
}

export default defineConfig({
  schema: "./src/schema/*.{ts,js}",
  out: path.join(__dirname, "./drizzle"),
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/db/schema.ts"],
  out: "./drizzle/migrations",
  dialect: "postgresql",
  verbose: true,
  strict: true,
});

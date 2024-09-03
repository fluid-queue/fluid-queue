import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/db/schema.ts"],
  out: "./drizzle/migrations",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: {
    url: "fluid.db",
  },
  verbose: true,
  strict: true,
});

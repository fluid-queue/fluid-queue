import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

async function main() {
  const migrationClient = new PGlite("fluid.db");
  await migrate(drizzle(migrationClient), {
    migrationsFolder: "drizzle/migrations",
  });
  await migrationClient.close();
}

void main();

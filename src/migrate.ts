/* Basic node script to run migrations using the database driver. */

import { driver } from "./db/db.js";
import * as schema from "fluid-queue/db/schema.js";
import { eq } from "drizzle-orm";

async function main() {
  await driver.migrate();
  // Sample code
  // TODO: remove this
  const user = await driver.runOnDb((db) =>
    db.query.WaitingTable.findFirst({
      where: eq(schema.WaitingTable.id, "6ae45213-1a9d-4067-8e1c-12bc6537c6d6"),
    })
  );
  console.log(user);
}

void main();

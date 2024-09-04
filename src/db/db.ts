import { v5 as uuidv5 } from "uuid";
import { Mutex } from "async-mutex";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "fluid-queue/db/schema.js";

// Used in the process of generating v5 UUIDs
const FLUID_QUEUE_NAMESPACE = "8d304583-a269-4918-8e02-42f199dda85a";

// *****************
// UTILITY FUNCTIONS
// *****************

/**
Generates a v5 UUID under the fluid-queue namespace.

UUIDs are required for access to the extension data table. While you are not
required to use this function to determine a UUID for your extension, this may
be a useful method.
*/
export function get_extension_uuid(name: string): string {
  return uuidv5(name, FLUID_QUEUE_NAMESPACE);
}

// ***************
// DATABASE ACCESS
// ***************

/**
Used for exclusive access to the database. PGLite is single user/connection, so
the mutex will help prevent multiple simultaneous access.
*/
const dbAccessor = new Mutex();

/**
Track whether the database has been initialized yet.
This will allow us to close the database if desired, and build a new one
as appropriate.
*/
let initialized = false;

/**
Async decorator that checks whether the database is initialized and obtains the
mutex for the database, ensuring operations are done safely.
*/
function locked<R, T, A extends unknown[]>(
  target: (this: T, ...args: A) => Promise<R> | PromiseLike<R>
): (this: T, ...args: A) => Promise<R> {
  return async function (this: T, ...args: A): Promise<R> {
    if (!initialized) {
      throw new Error("tried to use an uninitialized database");
    }
    return await dbAccessor.runExclusive(async () => {
      return await target.apply(this, args);
    });
  };
}

class FluidDatabase {
  // keep the backing postgres connection private
  private pg: PGlite;

  // the db needs to be kept private too, to ensure it's always locked
  // most things shouldn't use it directly, but sometimes they might want to
  private db: PgliteDatabase<typeof schema>;

  constructor() {
    if (initialized) {
      throw new Error("Tried to double initialize db");
    }
    initialized = true;
    if (dbAccessor.isLocked()) {
      throw new Error("Tried to initialize db with an existing lock");
    }
    this.pg = new PGlite("fluid.db");
    this.db = drizzle(this.pg, {
      schema: schema,
    });
  }

  /**
   * Run the database migrations.
   */
  @locked
  public async migrate() {
    await migrate(this.db, {
      migrationsFolder: "drizzle/migrations",
    });
  }

  /**
   * Run the specified function on the database, with exclusive access.
   * @param func The function to run. Required parameter of "db", which will be the Drizzle driver.
   * @returns The return value of `func`.
   */
  @locked
  public async runOnDb<R>(
    func: (db: PgliteDatabase<typeof schema>) => Promise<R>
  ): Promise<R> {
    return await func(this.db);
  }
}

const driver = new FluidDatabase();
Object.freeze(driver);
export { driver };

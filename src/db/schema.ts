import {
  pgTable,
  decimal,
  uuid,
  varchar,
  timestamp,
  boolean,
  interval,
  jsonb,
} from "drizzle-orm/pg-core";

import { relations } from "drizzle-orm";

// queue.json: waiting
// keep track of people who have submitted levels, and how long they've waited
// this also functions as our user table; rather than fk into a user table from
// this and from the queue, we fk into this from the queue
export const WaitingTable = pgTable("waiting", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  displayName: varchar("display_name").notNull(),
  lastOnline: timestamp("last_online").notNull(),
  waiting: interval("waiting").notNull(),
  weight: interval("weight").notNull(),
});

// queue.json: entries[current|queue] (no submitter data)
// Keep track of levels, for the queue and for other purposes
export const LevelTable = pgTable("levels", {
  id: uuid("id").primaryKey(),
  type: varchar("type").notNull(),
  code: varchar("code"),
  extension_data: jsonb("extension_data"),
});

// queue.json: entries[current] and entries[queue]
// current has a unique and check constraint that means it can only be either
// true or null, and only a single row can be true
export const QueueTable = pgTable("queue", {
  id: uuid("id").primaryKey(),
  submitted: timestamp("submitted").notNull(),
  submitter: varchar("submitter")
    .references(() => WaitingTable.id)
    .notNull(),
  level: uuid("level")
    .references(() => LevelTable.id)
    .notNull(),
  current: boolean("current").unique(), // check constraint is unimplemented in drizzle-orm, but we created it ourselves in a custom migration
});

// queue.json: extensions
// extension data will be stored in the database, as JSON
export const ExtensionDataTable = pgTable("extension_data", {
  id: uuid("id").primaryKey(),
  version: decimal("version"),
  data: jsonb("data"),
});

// *********
// relations
// *********

export const QueueRelations = relations(QueueTable, ({ one }) => ({
  waiting: one(WaitingTable, {
    fields: [QueueTable.submitter],
    references: [WaitingTable.id],
  }),
  level: one(LevelTable, {
    fields: [QueueTable.level],
    references: [LevelTable.id],
  }),
}));

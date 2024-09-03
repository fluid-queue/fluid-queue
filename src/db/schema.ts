import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  interval,
  integer,
  json,
} from "drizzle-orm/pg-core";

export const ChatterTable = pgTable("chatters", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  displayName: varchar("display_name").notNull(),
  lastOnline: timestamp("last_online").notNull(),
  waiting: interval("waiting").notNull(),
  weight: interval("weight").notNull(),
});

export const LevelTable = pgTable("levels", {
  id: uuid("id").primaryKey(),
  type: varchar("type").notNull(),
  code: varchar("code"),
  extension_data: json("extension_data"),
});

export const LevelStatsTable = pgTable("level_statistics", {
  id: uuid("id")
    .references(() => LevelTable.id)
    .primaryKey(),
  first_submitted: timestamp("submitted").notNull(),
  play_count: integer("play_count").notNull(),
  play_time: interval("total_time", { precision: 0 }),
});

export const QueueTable = pgTable("queue", {
  id: uuid("id").primaryKey(),
  submitted: timestamp("submitted").notNull(),
  submitter: varchar("submitter")
    .references(() => ChatterTable.id)
    .notNull(),
  level: uuid("level")
    .references(() => LevelTable.id)
    .notNull(),
  current: boolean("current").unique(), // check constraint is unimplemented in drizzle-orm, but we created it ourselves in a custom migration
  weight: interval("weight").notNull(),
});

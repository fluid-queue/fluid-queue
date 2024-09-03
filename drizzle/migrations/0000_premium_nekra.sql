CREATE TABLE IF NOT EXISTS "chatters" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"last_online" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "levels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submitted" timestamp NOT NULL,
	"code" varchar NOT NULL,
	"type" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submitted" timestamp NOT NULL,
	"submitter" varchar NOT NULL,
	"level" uuid NOT NULL,
	"current" boolean,
	"waiting" interval NOT NULL,
	"weight" interval NOT NULL,
	CONSTRAINT "queue_current_unique" UNIQUE("current")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "queue" ADD CONSTRAINT "queue_submitter_chatters_id_fk" FOREIGN KEY ("submitter") REFERENCES "public"."chatters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "queue" ADD CONSTRAINT "queue_level_levels_id_fk" FOREIGN KEY ("level") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

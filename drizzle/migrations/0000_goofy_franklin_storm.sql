CREATE TABLE IF NOT EXISTS "extension_data" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" numeric,
	"data" json
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "levels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" varchar NOT NULL,
	"code" varchar,
	"extension_data" json
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submitted" timestamp NOT NULL,
	"submitter" varchar NOT NULL,
	"level" uuid NOT NULL,
	"current" boolean,
	"weight" interval NOT NULL,
	CONSTRAINT "queue_current_unique" UNIQUE("current")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waiting" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"last_online" timestamp NOT NULL,
	"waiting" interval NOT NULL,
	"weight" interval NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "queue" ADD CONSTRAINT "queue_submitter_waiting_id_fk" FOREIGN KEY ("submitter") REFERENCES "public"."waiting"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "queue" ADD CONSTRAINT "queue_level_levels_id_fk" FOREIGN KEY ("level") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

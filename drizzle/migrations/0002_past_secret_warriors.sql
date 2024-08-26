CREATE TABLE IF NOT EXISTS "level_statistics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submitted" timestamp NOT NULL,
	"play_count" integer NOT NULL,
	"total_time" interval
);
--> statement-breakpoint
ALTER TABLE "levels" ALTER COLUMN "code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chatters" ADD COLUMN "waiting" interval NOT NULL;--> statement-breakpoint
ALTER TABLE "chatters" ADD COLUMN "weight" interval NOT NULL;--> statement-breakpoint
ALTER TABLE "levels" ADD COLUMN "extension_data" json;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "level_statistics" ADD CONSTRAINT "level_statistics_id_levels_id_fk" FOREIGN KEY ("id") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "levels" DROP COLUMN IF EXISTS "submitted";--> statement-breakpoint
ALTER TABLE "queue" DROP COLUMN IF EXISTS "waiting";
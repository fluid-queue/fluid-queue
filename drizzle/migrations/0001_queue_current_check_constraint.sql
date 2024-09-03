-- Add a check constraint on current, so current can be either null or true;
-- in combination with the unique constraint, this ensures only one current
-- but as many non-current as necessary
DO $$ BEGIN
 ALTER TABLE "queue" ADD CONSTRAINT "queue_current_check" CHECK("current");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

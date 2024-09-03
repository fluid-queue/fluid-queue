-- Custom SQL migration file, put you code below! --

-- Check constraint on current

DO $$ BEGIN
 ALTER TABLE "queue" ADD CONSTRAINT "queue_current_check" CHECK("current");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

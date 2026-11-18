-- Removes the "cross" workout type. Every cross day becomes an easy ride, keeping
-- its notes, distance and time. A second session stores its own sport only when
-- it differs from the day's first session, so the steps below keep that true.

-- 1. A second session that was cross becomes an easy ride.
UPDATE "workout"
SET "secondary" = "secondary" || '{"type": "easy", "sport": "bike"}'::jsonb
WHERE "secondary"->>'type' = 'cross';--> statement-breakpoint

-- 2. Before a cross day changes sport, pin its second session to the sport it
--    already had, so a PM run doesn't turn into a ride along with it.
UPDATE "workout"
SET "secondary" = "secondary" || jsonb_build_object('sport', "sport"::text)
WHERE "type" = 'cross' AND "secondary" IS NOT NULL AND NOT ("secondary" ? 'sport');--> statement-breakpoint

-- 3. The cross day itself becomes an easy ride.
UPDATE "workout" SET "type" = 'easy', "sport" = 'bike' WHERE "type" = 'cross';--> statement-breakpoint

-- 4. Drop a second session's sport where it now matches the first session's.
UPDATE "workout"
SET "secondary" = "secondary" - 'sport'
WHERE "secondary"->>'sport' = "sport"::text;--> statement-breakpoint

-- 5. Rebuild the enum without "cross". Postgres can't drop an enum value in place.
ALTER TYPE "public"."workout_type" RENAME TO "workout_type_old";--> statement-breakpoint
CREATE TYPE "public"."workout_type" AS ENUM('easy', 'long', 'tempo', 'threshold', 'intervals', 'recovery', 'race', 'rest');--> statement-breakpoint
ALTER TABLE "workout" ALTER COLUMN "type" TYPE "public"."workout_type" USING "type"::text::"public"."workout_type";--> statement-breakpoint
DROP TYPE "public"."workout_type_old";

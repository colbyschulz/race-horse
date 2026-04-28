CREATE TYPE "public"."plan_generation_status" AS ENUM('generating', 'complete');--> statement-breakpoint
DROP INDEX "message_user_created_idx";--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "generation_status" "plan_generation_status" DEFAULT 'complete' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "coach_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_user_plan_created_idx" ON "message" USING btree ("user_id","plan_id","created_at");
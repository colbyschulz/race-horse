ALTER TABLE "message" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX "message_user_created_idx";--> statement-breakpoint
CREATE INDEX "message_user_plan_created_idx" ON "message" USING btree ("user_id","plan_id","created_at");

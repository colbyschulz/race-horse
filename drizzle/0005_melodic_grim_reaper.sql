CREATE TYPE "public"."plan_file_status" AS ENUM('extracting', 'extracted', 'failed');--> statement-breakpoint
CREATE TABLE "plan_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"blob_url" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "plan_file_status" NOT NULL,
	"extraction_error" text,
	"extracted_payload" jsonb,
	"extracted_plan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_file" ADD CONSTRAINT "plan_file_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_file" ADD CONSTRAINT "plan_file_extracted_plan_id_plan_id_fk" FOREIGN KEY ("extracted_plan_id") REFERENCES "public"."plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_file_user_idx" ON "plan_file" USING btree ("userId","created_at");
CREATE TYPE "public"."chronicle_source" AS ENUM('manual', 'webhook');--> statement-breakpoint
CREATE TABLE "chronicle_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source" "chronicle_source" DEFAULT 'manual' NOT NULL,
	"created_by_subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chronicle_entries" ADD CONSTRAINT "chronicle_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chronicle_entries" ADD CONSTRAINT "chronicle_entries_created_by_subject_id_subjects_id_fk" FOREIGN KEY ("created_by_subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chronicle_entries_project_date_idx" ON "chronicle_entries" USING btree ("project_id","occurred_on");
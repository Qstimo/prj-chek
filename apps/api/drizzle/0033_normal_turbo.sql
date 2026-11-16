CREATE TYPE "public"."summary_task_origin" AS ENUM('model', 'human');--> statement-breakpoint
ALTER TYPE "public"."chronicle_source" ADD VALUE 'summary';--> statement-breakpoint
CREATE TABLE "summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chronicle_entry_id" uuid NOT NULL,
	"created_by_subject_id" uuid NOT NULL,
	"released_version_id" uuid,
	"suggester_name" text,
	"suggester_model" text,
	"suggested_at" timestamp with time zone,
	"suggested_text_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "summaries_chronicle_entry" UNIQUE("chronicle_entry_id")
);
--> statement-breakpoint
CREATE TABLE "summary_task_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"summary_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"origin" "summary_task_origin" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_chronicle_entry_id_chronicle_entries_id_fk" FOREIGN KEY ("chronicle_entry_id") REFERENCES "public"."chronicle_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_created_by_subject_id_subjects_id_fk" FOREIGN KEY ("created_by_subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_released_version_id_roadmap_versions_id_fk" FOREIGN KEY ("released_version_id") REFERENCES "public"."roadmap_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_task_drafts" ADD CONSTRAINT "summary_task_drafts_summary_id_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."summaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "summaries_project_created_idx" ON "summaries" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "summary_task_drafts_summary_idx" ON "summary_task_drafts" USING btree ("summary_id","position");
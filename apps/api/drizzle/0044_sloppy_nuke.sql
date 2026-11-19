CREATE TYPE "public"."transcriber_kind" AS ENUM('external', 'local');--> statement-breakpoint
CREATE TYPE "public"."transcription_state" AS ENUM('queued', 'extracting', 'sending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "transcription_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"summary_id" uuid,
	"requested_by_subject_id" uuid NOT NULL,
	"state" "transcription_state" DEFAULT 'queued' NOT NULL,
	"transcriber" "transcriber_kind" NOT NULL,
	"model" text NOT NULL,
	"host" text,
	"upload_path" text,
	"upload_bytes" integer NOT NULL,
	"upload_type" text NOT NULL,
	"audio_path" text,
	"audio_bytes" integer,
	"audio_type" text,
	"occurred_on" date,
	"title" text,
	"external_id" text,
	"failure_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "transcription_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "transcription_jobs_summary_id_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."summaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "transcription_jobs_requested_by_subject_id_subjects_id_fk" FOREIGN KEY ("requested_by_subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transcription_jobs_active" ON "transcription_jobs" USING btree ("summary_id") WHERE "transcription_jobs"."state" in ('queued','extracting','sending','running');--> statement-breakpoint
CREATE INDEX "transcription_jobs_queue" ON "transcription_jobs" USING btree ("started_at") WHERE "transcription_jobs"."state" in ('queued','extracting','sending','running');--> statement-breakpoint
CREATE INDEX "transcription_jobs_project_started" ON "transcription_jobs" USING btree ("project_id","started_at" DESC NULLS LAST);
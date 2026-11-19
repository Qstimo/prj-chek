CREATE TYPE "public"."summary_task_state" AS ENUM('active', 'archived', 'released');--> statement-breakpoint
DROP INDEX "summary_task_drafts_summary_idx";--> statement-breakpoint
ALTER TABLE "summary_task_drafts" ADD COLUMN "state" "summary_task_state" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "summary_task_drafts" ADD COLUMN "released_version_id" uuid;--> statement-breakpoint
ALTER TABLE "summary_task_drafts" ADD CONSTRAINT "summary_task_drafts_released_version_id_roadmap_versions_id_fk" FOREIGN KEY ("released_version_id") REFERENCES "public"."roadmap_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "summary_task_drafts_summary_state_idx" ON "summary_task_drafts" USING btree ("summary_id","state","position");--> statement-breakpoint
UPDATE "summary_task_drafts" AS "task"
SET "state" = 'released', "released_version_id" = "summary"."released_version_id"
FROM "summaries" AS "summary"
WHERE "task"."summary_id" = "summary"."id"
  AND "summary"."released_version_id" IS NOT NULL;

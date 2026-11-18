CREATE TABLE "summary_task_platforms" (
	"draft_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	CONSTRAINT "summary_task_platforms_draft_id_platform_id_pk" PRIMARY KEY("draft_id","platform_id")
);
--> statement-breakpoint
ALTER TABLE "summary_task_drafts" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "summary_task_platforms" ADD CONSTRAINT "summary_task_platforms_draft_id_summary_task_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."summary_task_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_task_platforms" ADD CONSTRAINT "summary_task_platforms_platform_id_project_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."project_platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "summary_task_platforms_platform_idx" ON "summary_task_platforms" USING btree ("platform_id");
ALTER TABLE "roadmap_checkpoints" ALTER COLUMN "task_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "roadmap_checkpoints" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "roadmap_checkpoints" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "roadmap_checkpoints" ADD CONSTRAINT "roadmap_checkpoints_task" UNIQUE("task_id");
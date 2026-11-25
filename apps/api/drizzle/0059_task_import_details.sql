ALTER TYPE "public"."task_origin" ADD VALUE 'tracker';--> statement-breakpoint
ALTER TABLE "task_exports" ADD COLUMN "details" jsonb;
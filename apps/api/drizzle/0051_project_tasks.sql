CREATE TYPE "public"."task_origin" AS ENUM('manual', 'summary', 'roadmap');--> statement-breakpoint
CREATE TABLE "project_task_platforms" (
	"task_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	CONSTRAINT "project_task_platforms_task_id_platform_id_pk" PRIMARY KEY("task_id","platform_id")
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"origin" "task_origin" NOT NULL,
	"source_summary_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roadmap_checkpoints" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "summary_task_drafts" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "project_task_platforms" ADD CONSTRAINT "project_task_platforms_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_platforms" ADD CONSTRAINT "project_task_platforms_platform_id_project_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."project_platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_source_summary_id_summaries_id_fk" FOREIGN KEY ("source_summary_id") REFERENCES "public"."summaries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_task_platforms_platform_idx" ON "project_task_platforms" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "project_tasks_project_idx" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "roadmap_checkpoints" ADD CONSTRAINT "roadmap_checkpoints_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_task_drafts" ADD CONSTRAINT "summary_task_drafts_task_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Перенос: на каждое существующее размещение — задача того проекта, к
-- которому относится его версия. Формулировка и ссылка переезжают как
-- есть, происхождение `roadmap`: эти чекпоинты заводили прямо в версии.
--
-- Идентификатор задачи не выдумывается отдельным запросом: `INSERT ...
-- SELECT ... RETURNING` не умеет вернуть связь со строкой-источником, а
-- `gen_random_uuid()` в двух местах дал бы два разных значения. Поэтому
-- задачи рождаются с идентификатором размещения — он уникален, и связь
-- после вставки выражается равенством.
INSERT INTO "project_tasks" ("id", "project_id", "title", "url", "origin", "created_at", "updated_at")
SELECT
  c."id",
  v."project_id",
  c."title",
  c."url",
  'roadmap'::"task_origin",
  c."created_at",
  c."updated_at"
FROM "roadmap_checkpoints" c
JOIN "roadmap_versions" v ON v."id" = c."version_id";--> statement-breakpoint
UPDATE "roadmap_checkpoints" SET "task_id" = "id" WHERE "task_id" IS NULL;--> statement-breakpoint
-- Теги переливаются на задачу тем же равенством идентификаторов.
INSERT INTO "project_task_platforms" ("task_id", "platform_id")
SELECT c."task_id", p."platform_id"
FROM "checkpoint_platforms" p
JOIN "roadmap_checkpoints" c ON c."id" = p."checkpoint_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Строки черновика, уже уехавшие в релиз, связываются с задачей там, где
-- связь однозначна: та же версия и та же формулировка. Неоднозначные
-- остаются пустыми — выдумывать связь нельзя, а пустая колонка честно
-- означает «этого мы не знаем».
UPDATE "summary_task_drafts" d
SET "task_id" = c."task_id"
FROM "roadmap_checkpoints" c
JOIN "roadmap_versions" v ON v."id" = c."version_id"
WHERE d."released_version_id" = v."id"
  AND c."title" = d."title"
  AND d."state" = 'released'
  AND (
    SELECT count(*)
    FROM "roadmap_checkpoints" c2
    WHERE c2."version_id" = v."id" AND c2."title" = d."title"
  ) = 1;

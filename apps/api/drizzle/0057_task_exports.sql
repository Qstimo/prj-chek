CREATE TABLE "task_exports" (
	"task_id" uuid NOT NULL,
	"tracker" "tracker_kind" NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"external_board_id" text NOT NULL,
	"external_column_id" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"exported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	"failure_code" text,
	CONSTRAINT "task_exports_task_id_tracker_pk" PRIMARY KEY("task_id","tracker")
);
--> statement-breakpoint
ALTER TABLE "task_exports" ADD CONSTRAINT "task_exports_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE restrict ON UPDATE no action;
CREATE TYPE "public"."tracker_kind" AS ENUM('weeek');--> statement-breakpoint
CREATE TABLE "tracker_connections" (
	"kind" "tracker_kind" PRIMARY KEY NOT NULL,
	"base_url" text NOT NULL,
	"secret_encrypted" text,
	"workspace_id" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_subject_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_project_bindings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"tracker" "tracker_kind" NOT NULL,
	"external_project_id" text NOT NULL,
	"board_id" text NOT NULL,
	"board_column_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_subject_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracker_connections" ADD CONSTRAINT "tracker_connections_updated_by_subject_id_subjects_id_fk" FOREIGN KEY ("updated_by_subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_project_bindings" ADD CONSTRAINT "tracker_project_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_project_bindings" ADD CONSTRAINT "tracker_project_bindings_updated_by_subject_id_subjects_id_fk" FOREIGN KEY ("updated_by_subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;
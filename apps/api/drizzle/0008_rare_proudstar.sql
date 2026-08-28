CREATE TYPE "public"."roadmap_version_state" AS ENUM('planned', 'in_progress', 'released');--> statement-breakpoint
CREATE TABLE "roadmap_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"title" text NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_public_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_public_links_project" UNIQUE("project_id"),
	CONSTRAINT "roadmap_public_links_token" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "roadmap_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"planned_date" date,
	"state" "roadmap_version_state" DEFAULT 'planned' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_versions_project_label" UNIQUE("project_id","label")
);
--> statement-breakpoint
ALTER TABLE "roadmap_checkpoints" ADD CONSTRAINT "roadmap_checkpoints_version_id_roadmap_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."roadmap_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_public_links" ADD CONSTRAINT "roadmap_public_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_versions" ADD CONSTRAINT "roadmap_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roadmap_checkpoints_version_idx" ON "roadmap_checkpoints" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "roadmap_versions_project_idx" ON "roadmap_versions" USING btree ("project_id");
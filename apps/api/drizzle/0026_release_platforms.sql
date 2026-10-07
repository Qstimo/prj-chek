CREATE TYPE "public"."platform_kind" AS ENUM('server', 'store', 'other');--> statement-breakpoint
CREATE TYPE "public"."platform_release_state" AS ENUM('on_test', 'in_review', 'released', 'rejected');--> statement-breakpoint
CREATE TABLE "checkpoint_platforms" (
	"checkpoint_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	CONSTRAINT "checkpoint_platforms_checkpoint_id_platform_id_pk" PRIMARY KEY("checkpoint_id","platform_id")
);
--> statement-breakpoint
CREATE TABLE "environment_platforms" (
	"environment_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	CONSTRAINT "environment_platforms_environment_id_platform_id_pk" PRIMARY KEY("environment_id","platform_id")
);
--> statement-breakpoint
CREATE TABLE "project_platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "platform_kind" NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_platforms_project_name" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "version_platform_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	"state" "platform_release_state" NOT NULL,
	"released_date" date,
	"build_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "version_platform_releases_version_platform" UNIQUE("version_id","platform_id")
);
--> statement-breakpoint
ALTER TABLE "checkpoint_platforms" ADD CONSTRAINT "checkpoint_platforms_checkpoint_id_roadmap_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."roadmap_checkpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint_platforms" ADD CONSTRAINT "checkpoint_platforms_platform_id_project_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."project_platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_platforms" ADD CONSTRAINT "environment_platforms_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_platforms" ADD CONSTRAINT "environment_platforms_platform_id_project_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."project_platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_platforms" ADD CONSTRAINT "project_platforms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_platform_releases" ADD CONSTRAINT "version_platform_releases_version_id_roadmap_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."roadmap_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_platform_releases" ADD CONSTRAINT "version_platform_releases_platform_id_project_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."project_platforms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkpoint_platforms_platform_idx" ON "checkpoint_platforms" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "environment_platforms_platform_idx" ON "environment_platforms" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "project_platforms_project_idx" ON "project_platforms" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "version_platform_releases_platform_idx" ON "version_platform_releases" USING btree ("platform_id");
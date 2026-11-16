CREATE TABLE "roadmap_report_public_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_report_public_links_version" UNIQUE("version_id"),
	CONSTRAINT "roadmap_report_public_links_token" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "roadmap_report_public_links" ADD CONSTRAINT "roadmap_report_public_links_version_id_roadmap_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."roadmap_versions"("id") ON DELETE restrict ON UPDATE no action;
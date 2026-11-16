ALTER TABLE "roadmap_checkpoints" ADD COLUMN "carried_from_version_id" uuid;--> statement-breakpoint
ALTER TABLE "domain_statuses" ADD COLUMN "health_code" text;--> statement-breakpoint
ALTER TABLE "domain_statuses" ADD COLUMN "redirect_to" text;--> statement-breakpoint
ALTER TABLE "domain_statuses" ADD COLUMN "resolved_ips" text[];--> statement-breakpoint
ALTER TABLE "domain_statuses" ADD COLUMN "tls_trusted" boolean;--> statement-breakpoint
ALTER TABLE "domain_statuses" ADD COLUMN "tls_code" text;--> statement-breakpoint
ALTER TABLE "roadmap_checkpoints" ADD CONSTRAINT "roadmap_checkpoints_carried_from_fk" FOREIGN KEY ("carried_from_version_id") REFERENCES "public"."roadmap_versions"("id") ON DELETE set null ON UPDATE no action;
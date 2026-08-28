CREATE TYPE "public"."health_state" AS ENUM('up', 'down');--> statement-breakpoint
CREATE TABLE "domain_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"tls_valid_to" timestamp with time zone,
	"tls_error" text,
	"registry_expires_at" timestamp with time zone,
	"registry_error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_statuses_domain" UNIQUE("domain_id")
);
--> statement-breakpoint
CREATE TABLE "environment_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"health" "health_state" NOT NULL,
	"latency_ms" integer,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environment_statuses_environment" UNIQUE("environment_id")
);
--> statement-breakpoint
ALTER TABLE "domain_statuses" ADD CONSTRAINT "domain_statuses_domain_id_environment_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."environment_domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_statuses" ADD CONSTRAINT "environment_statuses_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE restrict ON UPDATE no action;
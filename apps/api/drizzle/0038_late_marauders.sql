CREATE TYPE "public"."model_auth_scheme" AS ENUM('bearer', 'api_key', 'none');--> statement-breakpoint
CREATE TYPE "public"."model_service_kind" AS ENUM('task_suggester');--> statement-breakpoint
CREATE TYPE "public"."model_service_placement" AS ENUM('external', 'local');--> statement-breakpoint
CREATE TABLE "model_services" (
	"kind" "model_service_kind" PRIMARY KEY NOT NULL,
	"base_url" text NOT NULL,
	"auth_scheme" "model_auth_scheme" NOT NULL,
	"secret_encrypted" text,
	"model" text NOT NULL,
	"folder" text,
	"placement" "model_service_placement" NOT NULL,
	"timeout_seconds" integer DEFAULT 60 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_subject_id" uuid NOT NULL,
	CONSTRAINT "model_services_timeout_positive" CHECK ("model_services"."timeout_seconds" > 0)
);
--> statement-breakpoint
ALTER TABLE "model_services" ADD CONSTRAINT "model_services_updated_by_subject_id_subjects_id_fk" FOREIGN KEY ("updated_by_subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;
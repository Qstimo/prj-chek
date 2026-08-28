CREATE TABLE "variable_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variable_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"value_encrypted" text NOT NULL,
	"created_by_subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variable_versions_variable_no" UNIQUE("variable_id","version_no")
);
--> statement-breakpoint
CREATE TABLE "variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variables_environment_key" UNIQUE("environment_id","key")
);
--> statement-breakpoint
ALTER TABLE "variable_versions" ADD CONSTRAINT "variable_versions_variable_id_variables_id_fk" FOREIGN KEY ("variable_id") REFERENCES "public"."variables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_versions" ADD CONSTRAINT "variable_versions_created_by_subject_id_subjects_id_fk" FOREIGN KEY ("created_by_subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variables" ADD CONSTRAINT "variables_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "variable_versions_variable_idx" ON "variable_versions" USING btree ("variable_id");--> statement-breakpoint
CREATE INDEX "variables_environment_idx" ON "variables" USING btree ("environment_id");
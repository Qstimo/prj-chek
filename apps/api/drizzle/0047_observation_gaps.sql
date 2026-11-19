CREATE TYPE "public"."observation_gap_reason" AS ENUM('silence', 'blind');--> statement-breakpoint
CREATE TABLE "status_observation_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"reason" "observation_gap_reason" NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "status_observation_gaps_open" ON "status_observation_gaps" USING btree (("ended_at" is null)) WHERE "status_observation_gaps"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "status_observation_gaps_window" ON "status_observation_gaps" USING btree ("started_at","ended_at");
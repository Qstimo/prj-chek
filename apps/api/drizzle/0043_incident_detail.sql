ALTER TABLE "address_incidents" ADD COLUMN "last_cause" text;--> statement-breakpoint
ALTER TABLE "address_incidents" ADD COLUMN "last_down_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "address_incidents" ADD COLUMN "checks" integer DEFAULT 1 NOT NULL;
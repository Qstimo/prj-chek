CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner" text,
	"host" text,
	"ip" text,
	"provider" text,
	"specs" text,
	"paid_until" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servers_name" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "server_id" uuid;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environments_server_idx" ON "environments" USING btree ("server_id");--> statement-breakpoint
--> Перенос данных: серверные параметры окружений становятся серверами.
--> Ключ группировки — coalesce(host, ip): одинаковый адрес означает одну машину.
INSERT INTO "servers" ("name", "host", "ip", "provider", "specs")
SELECT
  grouped."key",
  min(grouped."host"),
  min(grouped."ip"),
  (array_agg(grouped."provider" ORDER BY (grouped."provider" IS NULL), grouped."created_at", grouped."name"))[1],
  (array_agg(grouped."specs" ORDER BY (grouped."specs" IS NULL), grouped."created_at", grouped."name"))[1]
FROM (
  SELECT coalesce("host", "ip") AS "key", "host", "ip", "provider", "specs", "created_at", "name"
  FROM "environments"
  WHERE "host" IS NOT NULL OR "ip" IS NOT NULL
) AS grouped
GROUP BY grouped."key";--> statement-breakpoint
UPDATE "environments" AS e
SET "server_id" = s."id"
FROM "servers" AS s
WHERE s."name" = coalesce(e."host", e."ip");--> statement-breakpoint
--> Расхождения внутри группы не теряются, а дописываются в заметки сервера.
UPDATE "servers" AS s
SET "notes" = diverged."notes"
FROM (
  SELECT
    e."server_id" AS "id",
    string_agg(
      'из окружения «' || e."name" || '»: ' || concat_ws(', ', e."provider", e."specs"),
      E'\n' ORDER BY e."name"
    ) AS "notes"
  FROM "environments" AS e
  JOIN "servers" AS owner ON owner."id" = e."server_id"
  WHERE (e."provider" IS NOT NULL AND e."provider" IS DISTINCT FROM owner."provider")
     OR (e."specs" IS NOT NULL AND e."specs" IS DISTINCT FROM owner."specs")
  GROUP BY e."server_id"
) AS diverged
WHERE s."id" = diverged."id";--> statement-breakpoint
--> Адрес окружения, совпавший с адресом машины, очищается: иначе он дублировался бы.
UPDATE "environments" AS e
SET "host" = NULL
FROM "servers" AS s
WHERE s."id" = e."server_id" AND e."host" IS NOT DISTINCT FROM s."host";--> statement-breakpoint
ALTER TABLE "environments" DROP COLUMN "ip";--> statement-breakpoint
ALTER TABLE "environments" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "environments" DROP COLUMN "specs";
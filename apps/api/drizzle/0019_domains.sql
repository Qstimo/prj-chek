CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner" text,
	"registrar" text,
	"paid_until" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_name" UNIQUE("name")
);
--> statement-breakpoint
--> Колонка добавляется допускающей пустоту: на непустой таблице NOT NULL
--> без значения по умолчанию отверг бы саму миграцию. Обязательной она
--> становится последним шагом, когда все корни проставлены.
ALTER TABLE "environment_domains" ADD COLUMN "domain_id" uuid;--> statement-breakpoint
--> Правило корня повторяет rootDomainOf из контракта: две последние метки,
--> кроме зон с регистрируемым именем третьего уровня. Функция временная и
--> удаляется в конце — она нужна только чтобы не писать выражение дважды.
CREATE FUNCTION "cairn_root_domain"(candidate text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN array_length(labels, 1) < 3 THEN lower(candidate)
    WHEN array_to_string(labels[array_length(labels, 1) - 1:array_length(labels, 1)], '.') = ANY (
      ARRAY['co.uk', 'org.uk', 'com.ua', 'com.br', 'com.au', 'co.jp', 'com.tr', 'co.il']
    )
      THEN array_to_string(labels[array_length(labels, 1) - 2:array_length(labels, 1)], '.')
    ELSE array_to_string(labels[array_length(labels, 1) - 1:array_length(labels, 1)], '.')
  END
  FROM string_to_array(lower(candidate), '.') AS labels
$fn$;--> statement-breakpoint
INSERT INTO "domains" ("name")
SELECT DISTINCT "cairn_root_domain"("name") FROM "environment_domains";--> statement-breakpoint
UPDATE "environment_domains" AS e
SET "domain_id" = d."id"
FROM "domains" AS d
WHERE d."name" = "cairn_root_domain"(e."name");--> statement-breakpoint
DROP FUNCTION "cairn_root_domain"(text);--> statement-breakpoint
ALTER TABLE "environment_domains" ALTER COLUMN "domain_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "environment_domains" ADD CONSTRAINT "environment_domains_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environment_domains_domain_idx" ON "environment_domains" USING btree ("domain_id");

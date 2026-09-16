--> Адрес окружения сводится к единственному полю — списку доменов.
--> Два поля об одном и том же расходились по смыслу: домены попадали
--> в реестр корней и под проверки сертификата и срока продления, а «адрес
--> окружения» не попадал никуда. Перед удалением колонки её содержимое
--> переносится: терять введённое молча нельзя.
--> Правило корня повторяет rootDomainOf из контракта — то же выражение,
--> что и в миграции 0019. Функция временная и удаляется в конце.
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
--> Отбор доменных адресов: приведение к нижнему регистру и обрезка по краям
--> повторяют domainSchema контракта, как и сама форма имени.
CREATE VIEW "cairn_host_moving" AS
  SELECT "id" AS environment_id, lower(btrim("host")) AS name
  FROM "environments"
  WHERE "host" IS NOT NULL
    AND lower(btrim("host")) ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    AND NOT EXISTS (
      SELECT 1 FROM "environment_domains" d
      WHERE d."environment_id" = "environments"."id" AND d."name" = lower(btrim("environments"."host"))
    );--> statement-breakpoint
--> Корень заводится тем же способом, что и при вводе домена руками:
--> только имя, остальные свойства проставит суперадмин.
INSERT INTO "domains" ("name")
SELECT DISTINCT "cairn_root_domain"(name) FROM "cairn_host_moving"
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
INSERT INTO "environment_domains" ("environment_id", "name", "domain_id")
SELECT m.environment_id, m.name, d."id"
FROM "cairn_host_moving" m
JOIN "domains" d ON d."name" = "cairn_root_domain"(m.name);--> statement-breakpoint
--> Адреса, доменом не являющиеся (IP, адрес с портом, внутреннее имя),
--> дописываются в заметки: в домены они не годятся, а выбрасывать их нельзя.
UPDATE "environments"
SET "notes" = concat_ws(E'\n', "notes", 'Адрес окружения: ' || btrim("host"))
WHERE "host" IS NOT NULL
  AND btrim("host") <> ''
  AND "id" NOT IN (SELECT environment_id FROM "cairn_host_moving");--> statement-breakpoint
DROP VIEW "cairn_host_moving";--> statement-breakpoint
DROP FUNCTION "cairn_root_domain"(text);--> statement-breakpoint
ALTER TABLE "environments" DROP COLUMN "host";

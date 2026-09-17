--> Адрес health-проверки сводится к адресам окружения — его доменам.
--> Полный URL был вторым местом, где жил адрес: HTTP-проверка ходила на один
--> хост, TLS и срок продления — на другой, и оба результата попадали в один
--> индикатор. У окружения остаётся путь ручки приложения, а хост переезжает
--> в домены: терять введённое молча нельзя.
--> Правило корня повторяет rootDomainOf из контракта — то же выражение,
--> что и в миграциях 0019 и 0021. Функция временная и удаляется в конце.
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
ALTER TABLE "environments" ADD COLUMN "health_check_path" text;--> statement-breakpoint
--> Разбор URL на хост и путь в одном месте: дальше обе части идут врозь.
CREATE VIEW "cairn_health_url" AS
  SELECT
    "id" AS environment_id,
    lower(split_part(regexp_replace(btrim("health_check_url"), '^[a-z][a-z0-9+.-]*://', '', 'i'), '/', 1)) AS host,
    --> Путь — всё от первого слеша после хоста, без строки запроса и якоря.
    --> Один голый слеш путём не считается: это и есть корень.
    nullif(
      substring(regexp_replace(btrim("health_check_url"), '^[a-z][a-z0-9+.-]*://', '', 'i') from '/[^?#]*'),
      '/'
    ) AS path
  FROM "environments"
  WHERE "health_check_url" IS NOT NULL AND btrim("health_check_url") <> '';--> statement-breakpoint
--> Путь принадлежит приложению, а не адресу: он остаётся у окружения
--> независимо от того, переезжает ли хост в домены.
UPDATE "environments" SET "health_check_path" = u.path
FROM "cairn_health_url" u WHERE u.environment_id = "environments"."id";--> statement-breakpoint
--> Отбор доменных хостов: форма имени та же, что в domainSchema контракта,
--> включая требование буквы в последней метке. Без него доменом прошёл бы
--> голый IP, корнем ему встала бы последняя пара чисел («113.10»), и в
--> реестре корней завелась бы запись, которую некому продлевать.
CREATE VIEW "cairn_health_host_moving" AS
  SELECT environment_id, host AS name
  FROM "cairn_health_url"
  WHERE host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    AND host ~ '\.[a-z][a-z0-9-]*$'
    AND NOT EXISTS (
      SELECT 1 FROM "environment_domains" d
      WHERE d."environment_id" = "cairn_health_url".environment_id AND d."name" = "cairn_health_url".host
    );--> statement-breakpoint
--> Корень заводится тем же способом, что и при вводе домена руками:
--> только имя, остальные свойства проставит суперадмин.
INSERT INTO "domains" ("name")
SELECT DISTINCT "cairn_root_domain"(name) FROM "cairn_health_host_moving"
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
INSERT INTO "environment_domains" ("environment_id", "name", "domain_id")
SELECT m.environment_id, m.name, d."id"
FROM "cairn_health_host_moving" m
JOIN "domains" d ON d."name" = "cairn_root_domain"(m.name)
ON CONFLICT ("environment_id", "name") DO NOTHING;--> statement-breakpoint
--> Хосты, доменом не являющиеся (IP, адрес с портом, внутреннее имя),
--> дописываются в заметки: адресом окружения им не стать, а выбрасывать
--> их нельзя. Хост, уже вписанный доменом, сюда не попадает: он на месте.
UPDATE "environments"
SET "notes" = concat_ws(E'\n', "notes", 'Адрес проверки: ' || u.host)
FROM "cairn_health_url" u
WHERE u.environment_id = "environments"."id"
  AND (
    u.host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    OR u.host !~ '\.[a-z][a-z0-9-]*$'
  );--> statement-breakpoint
DROP VIEW "cairn_health_host_moving";--> statement-breakpoint
DROP VIEW "cairn_health_url";--> statement-breakpoint
DROP FUNCTION "cairn_root_domain"(text);--> statement-breakpoint
ALTER TABLE "environments" DROP COLUMN "health_check_url";--> statement-breakpoint
--> Здоровье переезжает к адресу, к тем же срокам TLS и регистрации.
--> Обнуляемое: адрес мог ещё ни разу не проверяться.
ALTER TABLE "domain_statuses" ADD COLUMN "health" "health_state";--> statement-breakpoint
ALTER TABLE "domain_statuses" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "domain_statuses" ADD COLUMN "health_error" text;--> statement-breakpoint
--> Накопленные результаты не переносятся: они относились к окружению,
--> а не к адресу, и разложить их по адресам нечем. Первый же прогон
--> проверок наполнит таблицу заново — статус есть состояние, а не история.
DROP TABLE "environment_statuses";

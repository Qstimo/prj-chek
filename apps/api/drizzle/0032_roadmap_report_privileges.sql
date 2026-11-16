--> Роль приложения получает права на новую таблицу отдельной миграцией:
--> drizzle-kit их не выдаёт, а без них приложение упадёт на первом запросе
--> публичной ссылки отчёта отказом в правах.
--> Права на секвенции и типы не нужны: ключ — uuid с gen_random_uuid().
GRANT SELECT, INSERT, UPDATE, DELETE ON
  roadmap_report_public_links
TO cairn_app;

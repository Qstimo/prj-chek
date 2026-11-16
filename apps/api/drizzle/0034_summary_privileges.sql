--> Роль приложения получает права на новые таблицы отдельной миграцией:
--> drizzle-kit их не выдаёт, а без них приложение упадёт на первом запросе
--> саммари отказом в правах.
--> Права на секвенции и типы не нужны: ключ — uuid с gen_random_uuid(),
--> а новое значение `chronicle_source` добавлено структурной миграцией.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  summaries, summary_task_drafts
TO cairn_app;

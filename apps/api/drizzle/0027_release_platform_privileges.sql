--> Роль приложения получает права на новые таблицы отдельной миграцией:
--> drizzle-kit их не выдаёт, а без них приложение упадёт на первом запросе.
--> Права на секвенции и типы не нужны: ключи — uuid с gen_random_uuid(),
--> а USAGE на enum-типы есть у PUBLIC по умолчанию.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  project_platforms,
  environment_platforms,
  version_platform_releases,
  checkpoint_platforms
TO cairn_app;

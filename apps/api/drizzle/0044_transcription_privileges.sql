--> Роль приложения получает права на новую таблицу отдельной миграцией:
--> drizzle-kit их не выдаёт, а без них приложение упадёт на первой
--> загрузке записи созвона отказом в правах.
--> Права на секвенции и типы не нужны: ключ — uuid с gen_random_uuid(),
--> а оба перечня (`transcriber_kind`, `transcription_state`) заведены
--> структурной миграцией.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  transcription_jobs
TO cairn_app;

--> Разрешение имени становится четвёртой проверкой адреса, и его результат
--> ложится в ту же строку: адрес, куда смотрит имя, и причина отказа.
ALTER TABLE "domain_statuses" ADD COLUMN "resolved_ip" text;--> statement-breakpoint
ALTER TABLE "domain_statuses" ADD COLUMN "resolve_error" text;--> statement-breakpoint
--> Поиск машины по разрешённому адресу идёт на каждом прогоне.
--> Индекс, а не уникальность: NAT, переезды и две записи об одной машине —
--> обычная жизнь реестра, и ронять на них миграцию нельзя.
CREATE INDEX "servers_ip_idx" ON "servers" ("ip");

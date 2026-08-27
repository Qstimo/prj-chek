# CAIRN

Единый реестр независимых проектов: где проект развёрнут, жив ли он, чем настроен,
что по нему решали и на какой стадии находится.

Реализован этап 1 «Фундамент»: аутентификация с двухфакторной проверкой, проекты
с секцией «Инфо», модель выдач доступа, журнал действий.

## Требования

Node.js 22, pnpm 10 (проще всего через `corepack enable` — версия берётся из
`packageManager` в корневом `package.json`), Docker.

## Локальная разработка

```bash
cp .env.example .env
openssl rand -base64 32   # вставить в CAIRN_ENCRYPTION_KEY
pnpm install
docker compose up -d --wait postgres
pnpm --filter @cairn/api db:migrate
pnpm --filter @cairn/api cli create-superadmin admin@example.com
```

Команда выведет ссылку на установку пароля. Затем в двух окнах:

```bash
pnpm --filter @cairn/api dev
pnpm --filter @cairn/web dev
```

Интерфейс — http://localhost:3000

## Проверки

```bash
pnpm test        # тесты; интеграционные поднимают PostgreSQL в контейнере
pnpm typecheck   # проверка типов
```

## Развёртывание

```bash
docker compose build
docker compose up -d --wait
docker compose run --rm api node dist/db/migrate.js
docker compose run --rm api node dist/cli/main.js create-superadmin admin@example.com
```

Реверс-прокси сводит интерфейс и API на один домен `CAIRN_DOMAIN`: только так
сессионная cookie остаётся first-party и CORS не нужен. Для настоящего домена
Caddy получает сертификат сам.

Если 80 и 443 на машине заняты другим прокси, задай `CAIRN_HTTP_PORT` и
`CAIRN_HTTPS_PORT`. На нестандартных портах открывай систему сразу по HTTPS-порту:
переадресация с HTTP ведёт на имя домена без порта. Порт должен попасть и в
`CAIRN_WEB_URL` — из него строятся ссылки приглашений.

## Восстановление доступа

Если единственный суперадмин потерял пароль или устройство со вторым фактором:

```bash
docker compose run --rm api node dist/cli/main.js reset-password admin@example.com
docker compose run --rm api node dist/cli/main.js reset-totp admin@example.com
```

## Ключ шифрования

`CAIRN_ENCRYPTION_KEY` хранится отдельно от базы и не попадает в резервные копии
базы данных. При его потере зашифрованные значения восстановить невозможно —
это свойство схемы, а не дефект. Храните копию ключа отдельно.

## Документы

- `project-registry-spec [eTsSSz].md` — техническое задание
- `docs/superpowers/specs/` — дизайн этапов
- `docs/superpowers/plans/` — планы реализации

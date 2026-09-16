#!/usr/bin/env bash
# Восстановление базы из резервной копии.
#
#   scripts/restore.sh backups/cairn-20260916-120000.dump
#
# Действие разрушительное: текущее содержимое базы заменяется копией.
# Приложения на время восстановления останавливаются, чтобы они не писали
# в базу поверх восстанавливаемых данных.
#
# Значения переменных расшифровываются ключом CAIRN_ENCRYPTION_KEY: копия базы
# без того же ключа бесполезна. Убедись, что ключ в .env — тот, с которым
# копия снималась.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

dump="${1:-}"
[ -n "$dump" ] || fail 'укажи файл копии: scripts/restore.sh backups/cairn-ГГГГММДД-ЧЧММСС.dump'
[ -f "$dump" ] || fail "файл не найден: $dump"

compose ps --status running --services 2>/dev/null | grep -qx postgres \
  || fail 'база не запущена: docker compose -f docker-compose.yml up -d --wait postgres'

printf '%sБаза будет заменена содержимым файла %s%s\n' "$C_YELLOW" "$dump" "$C_OFF"
confirm_word 'восстановить' 'Набери «восстановить» для подтверждения: '

info 'Остановка приложений'
compose stop api web >/dev/null 2>&1 || true

info 'Восстановление'
# --clean --if-exists: объекты пересоздаются, отсутствующие не считаются ошибкой.
# Права роли приложения приходят из самой копии — pg_dump сохраняет GRANT.
compose exec -T postgres pg_restore -U cairn_owner -d cairn --clean --if-exists < "$dump"
ok 'данные восстановлены'

info 'Запуск'
compose up -d --wait --wait-timeout 180
ok 'система поднята'

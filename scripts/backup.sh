#!/usr/bin/env bash
# Резервная копия базы.
#
#   scripts/backup.sh              — снять копию, иначе ошибка
#   scripts/backup.sh --if-running — пропустить, если база не запущена
#                                    (так копию снимает deploy.sh на первом развёртывании)
#
# Копия ложится в ./backups и хранится в количестве CAIRN_BACKUP_KEEP (по умолчанию 10).
# ВАЖНО: ключ CAIRN_ENCRYPTION_KEY в копию не входит намеренно — без него
# зашифрованные значения переменных из дампа не восстановить. Храни ключ отдельно.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

skip_if_stopped=''
[ "${1:-}" = '--if-running' ] && skip_if_stopped=1

if ! compose ps --status running --services 2>/dev/null | grep -qx postgres; then
  [ -n "$skip_if_stopped" ] || fail 'контейнер базы не запущен'
  info 'база не запущена — копировать нечего'
  exit 0
fi

backup_dir="$ROOT/backups"
mkdir -p "$backup_dir"
target="$backup_dir/cairn-$(date +%Y%m%d-%H%M%S).dump"

info 'Резервная копия базы'
# Формат custom, а не текстовый SQL: он восстанавливается pg_restore выборочно
# и сжат по умолчанию.
if ! compose exec -T postgres pg_dump -U cairn_owner -d cairn --format=custom > "$target"; then
  rm -f "$target"
  fail 'pg_dump не отработал'
fi

# Пустой файл хуже отсутствующего: он выглядит копией, но ничего не содержит.
[ -s "$target" ] || { rm -f "$target"; fail 'копия вышла пустой'; }
ok "копия: ${target#"$ROOT"/} ($(du -h "$target" | cut -f1))"

keep="${CAIRN_BACKUP_KEEP:-10}"
# shellcheck disable=SC2012 — имена файлов заданы этим же скриптом, переводов строк в них нет.
ls -1t "$backup_dir"/cairn-*.dump 2>/dev/null | tail -n "+$((keep + 1))" | while read -r old; do
  rm -f "$old"
  info "удалена старая копия: $(basename "$old")"
done

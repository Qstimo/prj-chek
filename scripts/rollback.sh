#!/usr/bin/env bash
# Откат на предыдущую сборку образов.
#
#   scripts/rollback.sh
#
# Возвращает образы cairn-api:previous и cairn-web:previous, помеченные
# последним развёртыванием, и перезапускает систему.
#
# ВНИМАНИЕ: откатывается только код. Миграции необратимы: если последнее
# развёртывание изменило схему, старый код может её не понять. Тогда нужен
# и откат данных — scripts/restore.sh с копией, снятой перед развёртыванием.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

for service in api web; do
  docker image inspect "cairn-$service:previous" >/dev/null 2>&1 \
    || fail "нет образа cairn-$service:previous — откатывать не на что"
done

latest_backup="$(ls -1t "$ROOT"/backups/cairn-*.dump 2>/dev/null | head -n 1 || true)"
if [ -n "$latest_backup" ]; then
  info "последняя копия базы: ${latest_backup#"$ROOT"/}"
fi

confirm_word 'откат' 'Вернуть предыдущую сборку? Набери «откат»: '

info 'Возврат образов'
for service in api web; do
  docker image tag "cairn-$service:previous" "cairn-$service:latest"
  ok "cairn-$service:latest ← previous"
done

info 'Перезапуск'
compose up -d --force-recreate --wait --wait-timeout 180 api web proxy
ok 'система поднята на предыдущей сборке'

warn 'если развёртывание меняло схему базы, откатись и по данным: scripts/restore.sh <копия>'

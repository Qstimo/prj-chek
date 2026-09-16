#!/usr/bin/env bash
# Развёртывание с этой машины на сервер: заливка рабочей копии и сборка там.
#
#   scripts/deploy-remote.sh [пользователь@]хост [каталог] [-- ключи deploy.sh]
#
#   scripts/deploy-remote.sh cairn@203.0.113.10
#   scripts/deploy-remote.sh cairn@203.0.113.10 /srv/cairn -- --no-cache
#
# Каталог по умолчанию — /opt/cairn, его можно задать и переменной CAIRN_REMOTE_DIR.
#
# Отправляется рабочая копия как есть, включая незакоммиченные правки: это и
# есть смысл rsync-развёртывания. Файл .env на сервере принадлежит серверу —
# он не отправляется и не удаляется: там свои пароли, ключ и домен.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

target="${1:-}"
[ -n "$target" ] || fail 'укажи сервер: scripts/deploy-remote.sh [пользователь@]хост [каталог]'
shift

remote_dir="${CAIRN_REMOTE_DIR:-/opt/cairn}"
if [ $# -gt 0 ] && [ "$1" != '--' ]; then
  remote_dir="$1"
  shift
fi
[ "${1:-}" != '--' ] || shift
deploy_args=("$@")

require_cmd rsync
require_cmd ssh

if command -v git >/dev/null 2>&1 && [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
  warn 'в рабочей копии есть незакоммиченные изменения — они уедут на сервер'
fi

info "Проверка связи с $target"
ssh "$target" 'true' || fail "не удалось подключиться к $target"

# Каталог создаётся заранее: без него rsync отказывается принимать дерево.
ssh "$target" "mkdir -p '$remote_dir'"

info "Заливка кода в $target:$remote_dir"
# --delete убирает на сервере файлы, которых больше нет в рабочей копии: иначе
# удалённый модуль продолжал бы собираться. Исключённое из списка --delete не
# трогает, поэтому .env и копии базы на сервере переживают заливку.
rsync -az --delete \
  --include '.env.example' \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'dist/' \
  --exclude 'coverage/' \
  --exclude '*.tsbuildinfo' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'backups/' \
  --exclude '.claude/' \
  --exclude '.superpowers/' \
  --exclude '.DS_Store' \
  "$ROOT/" "$target:$remote_dir/"
ok 'код на сервере'

# .env принадлежит серверу и не заливается: проверяем, что он там есть, до того
# как развёртывание дойдёт до сборки.
if ! ssh "$target" "test -f '$remote_dir/.env'"; then
  fail "на сервере нет $remote_dir/.env — создай его там:
    ssh $target
    cd $remote_dir && cp .env.example .env
    openssl rand -base64 32   # в CAIRN_ENCRYPTION_KEY
    # задать пароли базы, CAIRN_DOMAIN, CAIRN_SCHEME=https, CAIRN_WEB_URL"
fi

info 'Развёртывание на сервере'
# -t: вывод скрипта идёт в терминал по мере работы, а не одним куском в конце.
ssh -t "$target" "cd '$remote_dir' && ./scripts/deploy.sh ${deploy_args[*]:-}"

#!/usr/bin/env bash
# Развёртывание готовыми образами: сборка на рабочей машине, перенос на сервер.
#
#   scripts/deploy-image.sh [пользователь@]хост [каталог] [--no-cache] [--pull] [-- ключи deploy.sh]
#
#   scripts/deploy-image.sh cairn@203.0.113.10
#   scripts/deploy-image.sh cairn@203.0.113.10 /srv/cairn --pull -- --skip-backup
#
# Зачем это вместо scripts/deploy-remote.sh: сборка Next просит около 2 ГБ
# памяти, и на маленькой машине она падает по OOM. Здесь на сервер уезжает
# готовый образ, а собирает его машина, у которой памяти хватает.
#
# Реестр образов не нужен: образы переносятся `docker save` в `docker load`
# через ssh. Цена простоты — трафик: слои не сверяются с тем, что уже есть на
# сервере, поэтому каждое развёртывание льёт образы целиком (сотни мегабайт).
# Если это станет мешать, следующий шаг — свой реестр на сервере, доступный
# через ssh-туннель: тогда поедут только изменившиеся слои.
#
# Исходники на сервер не отправляются вовсе — там нечего собирать. Уезжают
# только файлы развёртывания: docker-compose.yml, docker/, scripts/, .env.example.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

target=''
remote_dir=''
build_args=()
deploy_args=()

while [ $# -gt 0 ]; do
  case "$1" in
    --) shift; deploy_args=("$@"); break ;;
    --no-cache|--pull) build_args+=("$1") ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    -*) fail "неизвестный ключ: $1" ;;
    *)
      if [ -z "$target" ]; then target="$1"
      elif [ -z "$remote_dir" ]; then remote_dir="$1"
      else fail "лишний аргумент: $1"
      fi
      ;;
  esac
  shift
done

[ -n "$target" ] || fail 'укажи сервер: scripts/deploy-image.sh [пользователь@]хост [каталог]'
remote_dir="${remote_dir:-${CAIRN_REMOTE_DIR:-/opt/cairn}}"

require_cmd docker
require_cmd ssh
require_cmd rsync
require_cmd gzip
docker info >/dev/null 2>&1 || fail 'демон Docker на этой машине недоступен'

info "Проверка связи с $target"
ssh "$target" 'docker info >/dev/null 2>&1' || fail "на $target нет доступного Docker (или не удалось подключиться)"

# Образ собирается под архитектуру сборщика. Перенос x86-образа на ARM-сервер
# даёт «exec format error» уже при запуске контейнера, поэтому расхождение
# ловится здесь, до получасовой сборки и заливки.
local_arch="$(docker info --format '{{.Architecture}}')"
remote_arch="$(ssh "$target" "docker info --format '{{.Architecture}}'")"
[ "$local_arch" = "$remote_arch" ] || fail "архитектуры не совпадают: здесь $local_arch, на сервере $remote_arch.
Собирай на машине той же архитектуры либо разворачивай через scripts/deploy-remote.sh — там сборка идёт на сервере."
ok "архитектура совпадает: $local_arch"

if [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
  warn 'в рабочей копии есть незакоммиченные изменения — они попадут в образ'
fi

# Сборка обычным docker build, а не через compose: compose разбирает весь файл
# целиком и потребовал бы заполненный .env с паролями базы, которых сборке
# не нужно.
info 'Сборка образов'
docker build "${build_args[@]+"${build_args[@]}"}" -f "$ROOT/apps/api/Dockerfile" -t cairn-api:latest "$ROOT"
docker build "${build_args[@]+"${build_args[@]}"}" -f "$ROOT/apps/web/Dockerfile" -t cairn-web:latest "$ROOT"
ok 'образы собраны'

size="$(docker image inspect --format '{{.Size}}' cairn-api:latest cairn-web:latest \
  | awk '{sum+=$1} END {printf "%.0f", sum/1024/1024}')"

info "Файлы развёртывания в $target:$remote_dir"
ssh "$target" "mkdir -p '$remote_dir'"
# Каталоги синхронизируются с --delete, чтобы удалённый скрипт исчез и там;
# одиночные файлы отправляются как есть.
rsync -az --delete "$ROOT/docker/" "$target:$remote_dir/docker/"
rsync -az --delete "$ROOT/scripts/" "$target:$remote_dir/scripts/"
rsync -az "$ROOT/docker-compose.yml" "$ROOT/.env.example" "$target:$remote_dir/"
ok 'compose, Caddyfile и скрипты на месте'

if ! ssh "$target" "test -f '$remote_dir/.env'"; then
  fail "на сервере нет $remote_dir/.env — создай его там:
    ssh $target
    cd $remote_dir && cp .env.example .env
    openssl rand -base64 32   # в CAIRN_ENCRYPTION_KEY
    # задать пароли базы, CAIRN_DOMAIN, CAIRN_SCHEME=https, CAIRN_WEB_URL"
fi

# Пометка предыдущих образов ставится на сервере до загрузки новых: после
# загрузки под именем :latest лежал бы уже новый образ, и откат вернул бы его же.
info 'Отметка предыдущей сборки на сервере'
ssh "$target" '
  for service in api web; do
    if docker image inspect "cairn-$service:latest" >/dev/null 2>&1; then
      docker image tag "cairn-$service:latest" "cairn-$service:previous"
      echo "  ✓ cairn-$service:previous"
    else
      echo "  ==> cairn-$service на сервере ещё нет"
    fi
  done'

info "Перенос образов (${size} МБ до сжатия, канал — узкое место)"
# gzip -1: на образе из уже сжатых слоёв сильное сжатие почти ничего не даёт,
# а процессор нагружает так, что он становится медленнее канала.
docker save cairn-api:latest cairn-web:latest | gzip -1 | ssh "$target" 'gzip -d | docker load'
ok 'образы на сервере'

info 'Развёртывание на сервере'
# --no-build: собирать там нечего, образы уже загружены.
ssh -t "$target" "cd '$remote_dir' && ./scripts/deploy.sh --no-build ${deploy_args[*]:-}"

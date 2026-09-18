#!/usr/bin/env bash
# Развёртывание на сервере. Запускается в каталоге системы, на самой машине.
#
#   scripts/deploy.sh [--skip-backup] [--no-cache] [--no-build]
#
# Порядок шагов важен и не случаен:
#   проверки → копия базы → сборка → остановка приложений → миграции → запуск.
# Миграции применяются при остановленных приложениях, иначе старый код какое-то
# время работает с новой схемой. Несколько секунд недоступности дешевле, чем
# запросы, падающие на изменившихся таблицах.
#
# --no-build: образы уже готовы — их собрали на рабочей машине и загрузили сюда
# через scripts/deploy-image.sh. Тогда шаг сборки пропускается, и предыдущие
# образы не помечаются: пометку ставит deploy-image.sh до загрузки, иначе
# «предыдущим» оказался бы только что привезённый образ.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
source "$ROOT/scripts/preflight.sh"

skip_backup=''
skip_build=''
build_args=()

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-backup) skip_backup=1 ;;
    --no-build) skip_build=1 ;;
    --no-cache) build_args+=(--no-cache) ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) fail "неизвестный ключ: $1" ;;
  esac
  shift
done

started_at="$(date +%s)"

preflight_run

if [ -n "$skip_backup" ]; then
  warn 'копия базы пропущена по ключу --skip-backup: откатить неудачную миграцию будет нечем'
else
  "$ROOT/scripts/backup.sh" --if-running
fi

if [ -n "$skip_build" ]; then
  # Сборки не будет — значит, образы обязаны уже лежать здесь. Проверяем это
  # до остановки приложений: иначе система встанет, а поднимать будет нечего.
  for service in api web; do
    docker image inspect "cairn-$service:latest" >/dev/null 2>&1 \
      || fail "нет образа cairn-$service:latest — загрузи его: scripts/deploy-image.sh с рабочей машины"
  done
  ok 'образы на месте, сборка пропущена'
else
  # Предыдущие образы помечаются до сборки — на них возвращает scripts/rollback.sh.
  info 'Отметка предыдущей сборки'
  for service in api web; do
    if docker image inspect "cairn-$service:latest" >/dev/null 2>&1; then
      docker image tag "cairn-$service:latest" "cairn-$service:previous"
      ok "cairn-$service:previous"
    else
      info "cairn-$service ещё не собирался"
    fi
  done

  info 'Сборка образов'
  # Единственный шаг, зависящий от чужой сети: базовые образы (`node`, и через
  # compose — `postgres`, `caddy`) берутся из Docker Hub, а он отвечает 429,
  # когда IP сервера исчерпал лимит скачиваний. Всплеск переживается повтором;
  # если лимит исчерпан по-настоящему, помогает только авторизация — о ней
  # и говорит сообщение об отказе.
  retry 3 30 compose build "${build_args[@]}" \
    || fail 'сборка не удалась; если реестр ответил 429 Too Many Requests — это лимит скачиваний Docker Hub на адрес сервера: авторизуйся на сервере (docker login) и запусти развёртывание снова'
  ok 'образы собраны'
fi

info 'База'
compose up -d --wait --wait-timeout 180 postgres
ok 'база готова'

# Остановка на время миграций: см. пояснение в шапке.
info 'Остановка приложений на время миграций'
compose stop api web >/dev/null 2>&1 || true

info 'Миграции'
compose run --rm api node dist/db/migrate.js
ok 'схема приведена к текущей версии'

info 'Запуск'
compose up -d --wait --wait-timeout 180
ok 'контейнеры здоровы'

web_url="$(env_value CAIRN_WEB_URL)"
if command -v curl >/dev/null 2>&1; then
  info 'Проверка снаружи'
  # Тем же адресом, что и браузер: так проверяется и прокси, и сертификат.
  if curl -fsS --max-time 15 "${web_url%/}/api/health" | grep -q '"ok"'; then
    ok "система отвечает на ${web_url%/}/api/health"
  else
    fail "система не отвечает на ${web_url%/}/api/health — смотри логи: docker compose logs -f"
  fi
else
  warn 'curl не найден — внешняя проверка пропущена, проверка живости контейнеров пройдена'
fi

# Удаляются только образы без тегов: предыдущая сборка помечена и уцелеет.
info 'Уборка образов без тегов'
docker image prune -f >/dev/null

printf '\n'
ok "готово за $(( $(date +%s) - started_at )) с — $web_url"
printf '%sПервое развёртывание: создай суперадмина —%s\n' "$C_DIM" "$C_OFF"
printf '%s  docker compose -f docker-compose.yml run --rm api node dist/cli/main.js create-superadmin admin@example.com%s\n' "$C_DIM" "$C_OFF"

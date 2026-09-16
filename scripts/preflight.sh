#!/usr/bin/env bash
# Проверки перед развёртыванием: окружение сервера и .env.
#
# Запускается сам (`scripts/preflight.sh`) или подключается из deploy.sh.
# Смысл в том, чтобы ошибка настройки остановила развёртывание до сборки,
# а не проявилась неработающей системой через десять минут.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

preflight_run() {
  info 'Проверка окружения'

  require_cmd docker 'установи Docker Engine'
  docker compose version >/dev/null 2>&1 || fail 'нет плагина docker compose (v2)'
  docker info >/dev/null 2>&1 || fail 'демон Docker недоступен — запущен ли он и состоит ли пользователь в группе docker'
  ok 'Docker и compose на месте'

  [ -f "$ROOT/.env" ] || fail "нет файла .env в $ROOT — скопируй .env.example и заполни значения"

  local missing=()
  local key
  for key in POSTGRES_PASSWORD CAIRN_APP_PASSWORD CAIRN_ENCRYPTION_KEY CAIRN_DOMAIN CAIRN_WEB_URL; do
    [ -n "$(env_value "$key")" ] || missing+=("$key")
  done
  [ ${#missing[@]} -eq 0 ] || fail "в .env не заданы: ${missing[*]}"

  local pg_password app_password
  pg_password="$(env_value POSTGRES_PASSWORD)"
  app_password="$(env_value CAIRN_APP_PASSWORD)"
  case "$pg_password$app_password" in
    *change_me*) fail 'пароли базы остались из .env.example — замени их' ;;
  esac

  # Ключ шифрования: ровно 32 байта в base64 и без лишних символов. Приложение
  # проверяет то же самое при старте, но там отказ выглядит как упавший контейнер.
  local encryption_key size
  encryption_key="$(env_value CAIRN_ENCRYPTION_KEY)"
  size="$(printf '%s' "$encryption_key" | base64 -d 2>/dev/null | wc -c || true)"
  [ "$size" = "32" ] || fail 'CAIRN_ENCRYPTION_KEY не является 32 байтами в base64 — сгенерируй: openssl rand -base64 32'
  ok 'ключ шифрования в правильном виде'

  # Флаг снятия второго фактора на сервере недопустим: через учётку суперадмина
  # доступны секреты всех проектов.
  [ -z "$(env_value CAIRN_ALLOW_INSECURE_NO_TOTP)" ] \
    || fail 'CAIRN_ALLOW_INSECURE_NO_TOTP задан — на развёрнутой системе флаг недопустим'

  local domain scheme web_url
  domain="$(env_value CAIRN_DOMAIN)"
  scheme="$(env_value CAIRN_SCHEME)"
  web_url="$(env_value CAIRN_WEB_URL)"

  [ "$domain" != "localhost" ] || warn 'CAIRN_DOMAIN=localhost — система будет доступна только с самой машины'

  # Ссылки приглашений строятся из CAIRN_WEB_URL: расхождение с доменом делает
  # их нерабочими, а расхождение схемы — недоступными по HTTPS.
  case "$web_url" in
    *"$domain"*) ;;
    *) fail "CAIRN_WEB_URL ($web_url) не содержит CAIRN_DOMAIN ($domain) — ссылки приглашений уведут не туда" ;;
  esac
  case "$web_url" in
    *:3000*|*:3001*) fail "CAIRN_WEB_URL ($web_url) указывает на порт приложения — снаружи доступен только порт прокси" ;;
  esac
  if [ "$scheme" = "https" ]; then
    case "$web_url" in
      https://*) ;;
      *) fail 'CAIRN_SCHEME=https, а CAIRN_WEB_URL начинается не с https://' ;;
    esac
  else
    warn "CAIRN_SCHEME=$scheme — система будет работать без TLS"
  fi
  ok "адрес системы: $web_url"

  # Сборка Next — самая прожорливая часть: на машине без запаса памяти она
  # молча падает по OOM, и причина выглядит как непонятная ошибка компилятора.
  if [ -r /proc/meminfo ]; then
    local memory
    # Читается /proc, а не вывод free: у free заголовки строк переводятся
    # локалью, и разбор по «Mem:» на русской системе давал ноль.
    memory="$(awk '/^MemTotal:/ {mem=$2} /^SwapTotal:/ {swap=$2} END {printf "%d", (mem+swap)/1024}' /proc/meminfo)"
    if [ "${memory:-0}" -lt 2000 ]; then
      warn "памяти с подкачкой ${memory} МБ — сборка Next требует около 2 ГБ; добавь swap, иначе сборка упадёт по OOM"
    else
      ok "памяти с подкачкой ${memory} МБ"
    fi
  fi

  local free_gb
  free_gb="$(df -BG --output=avail "$ROOT" 2>/dev/null | tail -n 1 | tr -dc '0-9' || true)"
  if [ -n "$free_gb" ] && [ "$free_gb" -lt 5 ]; then
    warn "на диске свободно ${free_gb} ГБ — образам и базе может не хватить"
  fi
}

# Запущен напрямую, а не подключён через source.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  preflight_run
  ok 'проверки пройдены'
fi

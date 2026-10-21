#!/usr/bin/env bash
# Проверки перед развёртыванием: окружение сервера и .env.
#
# Запускается сам (`scripts/preflight.sh`) или подключается из deploy.sh.
# Смысл в том, чтобы ошибка настройки остановила развёртывание до сборки,
# а не проявилась неработающей системой через десять минут.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# Длина ключа VAPID в байтах; пусто, если это не base64url без «=».
# web-push разборчив ровно так: алфавит url-safe и точная длина после разбора,
# — и негодный ключ он отвергает уже при старте API, молча выключая уведомления.
vapid_key_size() {
  local key="$1"
  case "$key" in
    ''|*[!A-Za-z0-9_-]*) return 0 ;;
  esac

  # base64 -d не знает url-safe алфавита и требует выравнивания по четырём.
  local standard="${key//-/+}"
  standard="${standard//_//}"
  while [ $(( ${#standard} % 4 )) -ne 0 ]; do
    standard="$standard="
  done

  printf '%s' "$standard" | base64 -d 2>/dev/null | wc -c || true
}

# Ключи уведомлений о падении. Их отсутствие — рабочая настройка: уведомления
# выключаются целиком, и проверка только предупреждает. Останавливает она
# другое — пару, заданную наполовину или негодную: приложение такой ключ тоже
# отвергает, но снаружи это выглядит не ошибкой, а пропавшей кнопкой подписки.
preflight_vapid() {
  local scheme="$1"
  local public_key private_key subject
  public_key="$(env_value CAIRN_VAPID_PUBLIC_KEY)"
  private_key="$(env_value CAIRN_VAPID_PRIVATE_KEY)"
  subject="$(env_value CAIRN_VAPID_SUBJECT)"

  if [ -z "$public_key$private_key$subject" ]; then
    warn 'ключи VAPID не заданы — уведомления о падении выключены и кнопка подписки не появится; пара генерируется: pnpm --filter @cairn/api cli generate-vapid-keys'
    return 0
  fi

  local missing=()
  local key
  for key in CAIRN_VAPID_PUBLIC_KEY CAIRN_VAPID_PRIVATE_KEY CAIRN_VAPID_SUBJECT; do
    [ -n "$(env_value "$key")" ] || missing+=("$key")
  done
  [ ${#missing[@]} -eq 0 ] || fail "уведомления настроены наполовину — в .env не заданы: ${missing[*]}"

  case "$subject" in
    mailto:?*|https://?*) ;;
    *) fail "CAIRN_VAPID_SUBJECT ($subject) должен быть вида mailto:… или https://… — другой web-push отвергает" ;;
  esac

  [ "$(vapid_key_size "$public_key")" = "65" ] \
    || fail 'CAIRN_VAPID_PUBLIC_KEY не является 65 байтами в base64url — сгенерируй пару заново: pnpm --filter @cairn/api cli generate-vapid-keys'
  [ "$(vapid_key_size "$private_key")" = "32" ] \
    || fail 'CAIRN_VAPID_PRIVATE_KEY не является 32 байтами в base64url — сгенерируй пару заново: pnpm --filter @cairn/api cli generate-vapid-keys'

  # Подписка требует защищённого контекста: по HTTP браузер не даёт ни service
  # worker, ни Push API, и заданные ключи остаются без применения.
  if [ "$scheme" = "https" ]; then
    ok 'ключи уведомлений в правильном виде'
  else
    warn "ключи уведомлений заданы, но CAIRN_SCHEME=${scheme:-http} — по HTTP браузер не даст подписаться, уведомления работать не будут"
  fi
}

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

  # Снятие второго фактора — осознанный выбор владельца системы, поэтому
  # проверка предупреждает, а не останавливает развёртывание. Предупреждение
  # громкое намеренно: без второго фактора пароль суперадмина остаётся
  # единственным замком на секретах всех проектов.
  [ -z "$(env_value CAIRN_ALLOW_INSECURE_NO_TOTP)" ] \
    || warn 'CAIRN_ALLOW_INSECURE_NO_TOTP задан — второй фактор отключён, пароль суперадмина остаётся единственной защитой секретов'

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

  preflight_vapid "$scheme"

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

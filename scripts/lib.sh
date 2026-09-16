#!/usr/bin/env bash
# Общие функции скриптов развёртывания. Подключается через `source`, сам не запускается.

# Корень монорепо: скрипты должны работать из любого каталога.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_GREEN=$'\033[32m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_RED=''; C_YELLOW=''; C_GREEN=''; C_DIM=''; C_OFF=''
fi

info() { printf '%s==>%s %s\n' "$C_DIM" "$C_OFF" "$*"; }
ok()   { printf '%s  ✓%s %s\n' "$C_GREEN" "$C_OFF" "$*"; }
warn() { printf '%s  ! %s%s\n' "$C_YELLOW" "$*" "$C_OFF" >&2; }
fail() { printf '%s  ✗ %s%s\n' "$C_RED" "$*" "$C_OFF" >&2; exit 1; }

# Проверяет наличие команды.
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "не найдена команда «$1»${2:+ — $2}"
}

# Развёртывание запускает compose только с базовым файлом: docker-compose.override.yml
# публикует порт базы наружу и нужен лишь машине разработчика.
compose() {
  docker compose -f "$ROOT/docker-compose.yml" "$@"
}

# Значение переменной из .env. Файл не исполняется: подстановки и команды в нём
# не должны выполняться от имени скрипта.
env_value() {
  [ -f "$ROOT/.env" ] || return 0
  sed -n "s/^[[:space:]]*$1=//p" "$ROOT/.env" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# Спрашивает подтверждение: пользователь должен набрать ожидаемое слово целиком.
confirm_word() {
  local expected="$1" prompt="$2" answer
  printf '%s' "$prompt"
  read -r answer
  [ "$answer" = "$expected" ] || fail 'отменено'
}

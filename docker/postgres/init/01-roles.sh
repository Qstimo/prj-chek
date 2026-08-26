#!/bin/bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE cairn_app WITH LOGIN PASSWORD '${CAIRN_APP_PASSWORD}';
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO cairn_app;
  GRANT USAGE ON SCHEMA public TO cairn_app;
EOSQL

#!/usr/bin/env bash
# Заливає SQL-дамп локальної бази (треки, плейлисти, акаунти) у базу на сервері.
#   bash restore-db.sh /tmp/beatify.sql
# УВАГА: повністю замінює поточну базу сервера вмістом дампа (DROP + CREATE таблиць).
set -euo pipefail
DUMP="${1:?Вкажіть файл дампа:  bash restore-db.sh /tmp/beatify.sql}"
INSTALL_DIR="${INSTALL_DIR:-/opt/beatify}"
COMPOSE="docker compose -f $INSTALL_DIR/deploy/docker-compose.yml --env-file $INSTALL_DIR/deploy/.env"

echo "[*] Зупиняю застосунок на час відновлення..."
$COMPOSE stop app

# pg_dump нового Postgres додає рядки, яких не знає Postgres 16 з контейнера — прибираємо їх
echo "[*] Відновлюю базу..."
grep -v -E '^(SET transaction_timeout|\restrict|\unrestrict)' "$DUMP" \
  | $COMPOSE exec -T db psql -U beatify -d beatify -v ON_ERROR_STOP=0 -q > /tmp/beatify-restore.log 2>&1 || true
ERR=$(grep -c -i 'error' /tmp/beatify-restore.log || true)

$COMPOSE start app
echo "✅ База відновлена (помилок у логу: $ERR; повний лог: /tmp/beatify-restore.log)"

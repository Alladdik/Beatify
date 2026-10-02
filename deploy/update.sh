#!/usr/bin/env bash
# ── Beatify: оновлення на VPS ─────────────────────────────────────────────────
# Запускається після завантаження нового коду (upload.ps1 викликає його сам) або після зміни deploy/.env:
#   bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[*] Перезбираю образ і перезапускаю..."
YTDLP_REFRESH=$(date +%F) docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

echo "[*] Чищу старі образи..."
docker image prune -f >/dev/null

echo ""
echo "✅ Оновлено! Логи: docker compose -f deploy/docker-compose.yml logs -f app"

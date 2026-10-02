#!/usr/bin/env bash
# ── Beatify: підтягнути нову версію з GitHub і перезібрати, якщо вона з'явилась ──
# Запускається вручну або з cron (його ставить vps-deploy/install.sh):
#   bash deploy/pull-update.sh           # оновити, лише якщо на GitHub є нові коміти
#   bash deploy/pull-update.sh --force   # перезібрати в будь-якому разі
# deploy/.env і томи (база, треки) не зачіпаються.
set -euo pipefail
cd "$(dirname "$0")/.."

# не запускати двічі одночасно (cron може стрілити, поки йде довга збірка)
exec 9>/tmp/beatify-update.lock
flock -n 9 || { echo "[*] Оновлення вже виконується"; exit 0; }

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "HEAD" ] && BRANCH="main"
FORCE="${1:-}"

git fetch --depth 1 --quiet origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse FETCH_HEAD)"

if [ "$LOCAL" = "$REMOTE" ] && [ "$FORCE" != "--force" ]; then
  echo "[*] $(date '+%F %T') Нових змін немає (${LOCAL:0:7})"
  exit 0
fi

echo "[*] $(date '+%F %T') ${LOCAL:0:7} → ${REMOTE:0:7}"
git reset --hard FETCH_HEAD
# update.sh береться вже з нової версії
exec bash deploy/update.sh

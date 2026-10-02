#!/usr/bin/env bash
# ── Beatify (без Docker): підтягнути нову версію з GitHub, зібрати і перезапустити ──
#   bash deploy/native-update.sh            # лише якщо на GitHub є нові коміти
#   bash deploy/native-update.sh --force    # зібрати в будь-якому разі
# Запускається від root (cron ставить install-native.sh). База і треки (/var/lib/beatify) не зачіпаються.
set -euo pipefail
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/beatify-app
DATA=/var/lib/beatify
cd "$SRC"

exec 9>/tmp/beatify-update.lock
flock -n 9 || { echo "[*] Оновлення вже виконується"; exit 0; }

# yt-dlp needs a JavaScript runtime to solve YouTube's signature challenge; Node is already installed for the build
if command -v yt-dlp >/dev/null && yt-dlp --help 2>/dev/null | grep -q -- '--js-runtimes' && ! grep -qs 'js-runtimes' /etc/yt-dlp.conf; then
  echo '--js-runtimes node' >> /etc/yt-dlp.conf
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"; [ "$BRANCH" = "HEAD" ] && BRANCH=main
git fetch --depth 1 --quiet origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"; REMOTE="$(git rev-parse FETCH_HEAD)"
if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ] && [ -f "$APP/app/BeatifyServer.dll" ]; then
  echo "[*] $(date '+%F %T') Нових змін немає (${LOCAL:0:7})"; exit 0
fi
echo "[*] $(date '+%F %T') ${LOCAL:0:7} → ${REMOTE:0:7}"
git reset --hard FETCH_HEAD

echo "[*] Збираю клієнт..."
( cd client && { npm ci --no-audit --no-fund || npm install --no-audit --no-fund; } && npm run build:web )

echo "[*] Збираю сервер..."
rm -rf "$APP/new"; mkdir -p "$APP/new"
dotnet publish server/BeatifyServer.csproj -c Release -o "$APP/new/app" --nologo -v q
cp -r client/dist-web "$APP/new/spa"
# треки живуть поза папкою програми — підключаємо їх символічним посиланням
mkdir -p "$APP/new/app/wwwroot" "$DATA/uploads" "$DATA/studio"
rm -rf "$APP/new/app/wwwroot/uploads"
ln -sfn "$DATA/uploads" "$APP/new/app/wwwroot/uploads"
chown -R beatify:beatify "$APP/new" "$DATA"

echo "[*] Перемикаю на нову версію..."
systemctl stop beatify 2>/dev/null || true
rm -rf "$APP/old"; [ -d "$APP/app" ] && mv "$APP/app" "$APP/old"; [ -d "$APP/spa" ] && rm -rf "$APP/spa"
mv "$APP/new/app" "$APP/app"; mv "$APP/new/spa" "$APP/spa"; rmdir "$APP/new"
systemctl start beatify

# швидка перевірка, що піднялось
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:5000/healthz >/dev/null 2>&1 && { echo "✅ Оновлено і працює (${REMOTE:0:7})"; rm -rf "$APP/old"; exit 0; }
  sleep 2
done
echo "❌ Сервіс не відповів на /healthz — відкочую"
systemctl stop beatify || true
rm -rf "$APP/app"; [ -d "$APP/old" ] && mv "$APP/old" "$APP/app"
systemctl start beatify || true
journalctl -u beatify -n 40 --no-pager
exit 1

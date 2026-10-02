#!/usr/bin/env bash
# ── Beatify: встановлення на VPS БЕЗ Docker (Ubuntu/Debian, від root) ─────────
#   curl -fsSL https://raw.githubusercontent.com/Alladdik/Beatify/main/vps-deploy/install-native.sh | bash
# Ставить: PostgreSQL, .NET 10, Node 22, ffmpeg, yt-dlp, cloudflared. Клонує код з GitHub, збирає,
# запускає як systemd-сервіс `beatify`, вмикає автооновлення з GitHub (cron) і Cloudflare-тунель (https-лінк).
# Повторний запуск безпечний: код оновлюється, база й треки не чіпаються.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Запустіть від root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive DOTNET_CLI_TELEMETRY_OPTOUT=1

REPO_URL="${REPO_URL:-https://github.com/Alladdik/Beatify.git}"
BRANCH="${BRANCH:-main}"
SRC="${INSTALL_DIR:-/opt/beatify}"
DATA=/var/lib/beatify
ENVFILE=/etc/beatify/beatify.env
AUTO_UPDATE_MINUTES="${AUTO_UPDATE_MINUTES:-5}"
TUNNEL="${CLOUDFLARE_TUNNEL:-quick}"          # quick | off ;  CF_TUNNEL_TOKEN=... → постійний тунель

echo "[1/7] Пакети..."
apt-get update -qq
apt-get install -y -qq git curl ca-certificates cron util-linux openssl ffmpeg postgresql postgresql-contrib unzip

echo "[2/7] .NET 10..."
if ! command -v dotnet &>/dev/null || ! dotnet --list-sdks | grep -q '^10\.'; then
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
  bash /tmp/dotnet-install.sh --channel 10.0 --install-dir /usr/share/dotnet
  ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet
fi
dotnet --version

echo "[3/7] Node 22..."
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - || true
  apt-get install -y -qq nodejs || apt-get install -y -qq nodejs npm
fi
node -v

echo "[4/7] yt-dlp..."
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

echo "[5/7] База і користувач..."
id beatify &>/dev/null || useradd --system --home "$DATA" --shell /usr/sbin/nologin beatify
mkdir -p "$DATA/uploads" "$DATA/studio" /etc/beatify /opt/beatify-app
systemctl enable --now postgresql
if [ -f "$ENVFILE" ]; then
  PGPASS="$(grep -E '^DB_PASSWORD=' "$ENVFILE" | cut -d= -f2-)"
else
  PGPASS="$(openssl rand -hex 24)"
fi
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='beatify'" | grep -q 1; then
  sudo -u postgres psql -c "ALTER ROLE beatify WITH LOGIN PASSWORD '$PGPASS'" >/dev/null
else
  sudo -u postgres psql -c "CREATE ROLE beatify WITH LOGIN PASSWORD '$PGPASS'" >/dev/null
fi
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='beatify'" | grep -q 1 \
  || sudo -u postgres createdb -O beatify beatify

if [ ! -f "$ENVFILE" ]; then
  cat > "$ENVFILE" <<ENV
DB_PASSWORD=$PGPASS
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://127.0.0.1:5000
ConnectionStrings__DefaultConnection=Host=127.0.0.1;Port=5432;Database=beatify;Username=beatify;Password=$PGPASS
Jwt__Key=$(openssl rand -base64 48 | tr -d '\n/+=')
Cors__Origins=
Auth__AllowRegistration=true
SPA_ROOT=/opt/beatify-app/spa
Studio__Path=$DATA/studio
YTDLP_PATH=/usr/local/bin/yt-dlp
Spotify__ClientId=
Spotify__ClientSecret=
ENV
  chmod 600 "$ENVFILE"
  echo "    створено $ENVFILE з випадковими секретами"
fi

echo "[6/7] Код з GitHub, збірка, сервіс..."
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" remote set-url origin "$REPO_URL"
  git -C "$SRC" fetch --depth 1 origin "$BRANCH"
  git -C "$SRC" reset --hard FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$SRC"
fi

cat > /etc/systemd/system/beatify.service <<UNIT
[Unit]
Description=Beatify
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=beatify
WorkingDirectory=/opt/beatify-app/app
EnvironmentFile=$ENVFILE
ExecStart=/usr/bin/dotnet /opt/beatify-app/app/BeatifyServer.dll
Restart=always
RestartSec=5
KillSignal=SIGINT

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable beatify >/dev/null 2>&1

bash "$SRC/deploy/native-update.sh" --force

# cron: автооновлення з GitHub + щоденний yt-dlp
CRON_TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v 'beatify-managed' > "$CRON_TMP" || true
if [ "$AUTO_UPDATE_MINUTES" -gt 0 ]; then
  echo "*/${AUTO_UPDATE_MINUTES} * * * * bash $SRC/deploy/native-update.sh >> /var/log/beatify-update.log 2>&1 # beatify-managed" >> "$CRON_TMP"
fi
echo "17 4 * * * /usr/local/bin/yt-dlp -U >> /var/log/beatify-update.log 2>&1 # beatify-managed" >> "$CRON_TMP"
crontab "$CRON_TMP"; rm -f "$CRON_TMP"

echo "[7/7] Cloudflare Tunnel..."
TUNNEL_URL=""
if [ "$TUNNEL" != "off" ]; then
  if ! command -v cloudflared &>/dev/null; then
    ARCH="$(dpkg --print-architecture)"
    curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
    dpkg -i /tmp/cloudflared.deb && rm -f /tmp/cloudflared.deb
  fi
  if [ -n "${CF_TUNNEL_TOKEN:-}" ]; then
    cloudflared service uninstall 2>/dev/null || true
    cloudflared service install "$CF_TUNNEL_TOKEN"
    echo "    постійний тунель запущено (Public hostname у Cloudflare → http://localhost:5000)"
  else
    cat > /etc/systemd/system/beatify-tunnel.service <<UNIT
[Unit]
Description=Beatify Cloudflare quick tunnel
After=network-online.target beatify.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:5000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable beatify-tunnel >/dev/null 2>&1
    systemctl restart beatify-tunnel
    for _ in $(seq 1 30); do
      TUNNEL_URL="$(journalctl -u beatify-tunnel --since '-3min' --no-pager 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
      [ -n "$TUNNEL_URL" ] && break
      sleep 2
    done
    [ -n "$TUNNEL_URL" ] && echo "$TUNNEL_URL" > /root/beatify-url.txt
  fi
fi

echo ""
echo "✅ Beatify встановлено."
[ -n "$TUNNEL_URL" ] && echo "   🌐 ЛІНК: $TUNNEL_URL   (/root/beatify-url.txt; змінюється після перезапуску тунелю: journalctl -u beatify-tunnel | grep trycloudflare)"
echo "   ⚠  Перший зареєстрований користувач стає адміном — зареєструйся першим."
echo "   Логи: journalctl -u beatify -f   |   Оновити зараз: bash $SRC/deploy/native-update.sh --force"
echo "   Автооновлення: кожні ${AUTO_UPDATE_MINUTES} хв (потрібно, щоб репозиторій був публічним). Лог: /var/log/beatify-update.log"

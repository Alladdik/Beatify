#!/usr/bin/env bash
# ── Beatify: встановлення на VPS одним запуском ───────────────────────────────
# Покладіть цю папку (vps-deploy) на сервер і виконайте від root:
#   cp config.env.example config.env && nano config.env     # токен GitHub, домен
#   bash install.sh
# Скрипт сам: ставить Docker і git → клонує код з GitHub → генерує секрети → збирає й запускає →
# вмикає автооновлення (раз на кілька хвилин тягне нові коміти) та щоденне оновлення yt-dlp.
# Повторний запуск безпечний: код оновлюється, база й треки не чіпаються.
set -euo pipefail
cd "$(dirname "$0")"

[ "$(id -u)" -eq 0 ] || { echo "Запустіть від root (або через sudo)"; exit 1; }
[ -f config.env ] || { echo "Немає config.env — скопіюйте config.env.example у config.env і заповніть"; exit 1; }
# shellcheck disable=SC1091
set -a; . ./config.env; set +a

REPO_URL="${REPO_URL:?REPO_URL порожній у config.env}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/beatify}"
AUTO_UPDATE_MINUTES="${AUTO_UPDATE_MINUTES:-5}"
CLOUDFLARE_TUNNEL="${CLOUDFLARE_TUNNEL:-quick}"   # quick | token | off
CF_TUNNEL_TOKEN="${CF_TUNNEL_TOKEN:-}"

# 1. Docker + git + cron
if ! command -v docker &>/dev/null; then
  echo "[*] Встановлюю Docker..."
  curl -fsSL https://get.docker.com | sh || {
    echo "[*] get.docker.com не спрацював — ставлю Docker з репозиторію системи..."
    apt-get update -qq && apt-get install -y -qq docker.io docker-compose-v2 || apt-get install -y -qq docker.io docker-compose-plugin
  }
  systemctl enable --now docker
fi
if ! command -v git &>/dev/null || ! command -v flock &>/dev/null || ! command -v crontab &>/dev/null; then
  echo "[*] Встановлюю git, cron..."
  apt-get update -qq && apt-get install -y -qq git cron util-linux
fi

# 2. Код з GitHub. Історія репозиторію велика, тому клон поверхневий (--depth 1): тягнеться лише останній стан.
AUTH_URL="$REPO_URL"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  AUTH_URL="${REPO_URL/https:\/\//https://x-access-token:${GITHUB_TOKEN}@}"
fi
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "[*] Код уже є в $INSTALL_DIR — оновлюю"
  git -C "$INSTALL_DIR" remote set-url origin "$AUTH_URL"
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard FETCH_HEAD
else
  echo "[*] Клоную $REPO_URL ($BRANCH) → $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 --branch "$BRANCH" "$AUTH_URL" "$INSTALL_DIR"
fi
chmod 600 "$INSTALL_DIR/.git/config"   # у ньому токен

# 3. Перший запуск (генерує deploy/.env із секретами, збирає образ, піднімає контейнери)
bash "$INSTALL_DIR/deploy/deploy.sh" "${DOMAIN:-}"

# 4. Автооновлення і yt-dlp
CRON_TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v 'beatify-managed' > "$CRON_TMP" || true
if [ "$AUTO_UPDATE_MINUTES" -gt 0 ]; then
  echo "*/${AUTO_UPDATE_MINUTES} * * * * bash $INSTALL_DIR/deploy/pull-update.sh >> /var/log/beatify-update.log 2>&1 # beatify-managed" >> "$CRON_TMP"
fi
echo "17 4 * * * docker compose -f $INSTALL_DIR/deploy/docker-compose.yml exec -T -u root app yt-dlp -U >> /var/log/beatify-update.log 2>&1 # beatify-managed" >> "$CRON_TMP"
crontab "$CRON_TMP"; rm -f "$CRON_TMP"

# 5. Cloudflare Tunnel: публічний https-лінк без відкритих портів і без домену
if [ "$CLOUDFLARE_TUNNEL" != "off" ]; then
  if ! command -v cloudflared &>/dev/null; then
    echo "[*] Встановлюю cloudflared..."
    ARCH="$(dpkg --print-architecture)"
    curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
    dpkg -i /tmp/cloudflared.deb && rm -f /tmp/cloudflared.deb
  fi
  APP_PORT_NOW="$(grep -E '^APP_PORT=' "$INSTALL_DIR/deploy/.env" | cut -d= -f2-)"
  if [ -n "$CF_TUNNEL_TOKEN" ]; then
    # іменований тунель (постійна адреса, домен налаштовується в Cloudflare Zero Trust → Tunnels → Public hostname → http://localhost:${APP_PORT_NOW:-5000})
    cloudflared service uninstall 2>/dev/null || true
    cloudflared service install "$CF_TUNNEL_TOKEN"
    echo "[*] Постійний Cloudflare-тунель запущено (адреса — у вашому Cloudflare Zero Trust)"
  else
    cat > /etc/systemd/system/beatify-tunnel.service <<UNIT
[Unit]
Description=Beatify Cloudflare quick tunnel
After=network-online.target docker.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url http://localhost:${APP_PORT_NOW:-5000}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable beatify-tunnel >/dev/null 2>&1
    systemctl restart beatify-tunnel
    echo "[*] Чекаю на адресу тунелю..."
    TUNNEL_URL=""
    for _ in $(seq 1 30); do
      TUNNEL_URL="$(journalctl -u beatify-tunnel --since '-2min' --no-pager 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
      [ -n "$TUNNEL_URL" ] && break
      sleep 2
    done
    [ -n "$TUNNEL_URL" ] && echo "$TUNNEL_URL" > /root/beatify-url.txt
  fi
fi

echo ""
echo "✅ Готово."
[ -n "${TUNNEL_URL:-}" ] && echo "   🌐 Лінк (Cloudflare): $TUNNEL_URL   (зберігається в /root/beatify-url.txt; після перезапуску тунелю адреса зміниться — дивись: journalctl -u beatify-tunnel | grep trycloudflare)"
[ "$AUTO_UPDATE_MINUTES" -gt 0 ] && echo "   Автооновлення: кожні ${AUTO_UPDATE_MINUTES} хв перевіряється GitHub (лог: /var/log/beatify-update.log)"
echo "   Оновити негайно:  bash $INSTALL_DIR/vps-deploy/update-now.sh"
echo "   Перенести свою музику з ПК:  див. vps-deploy/README.md (upload-media.ps1)"

#!/usr/bin/env bash
# ── Beatify: перший запуск на VPS ─────────────────────────────────────────────
# З кореня проєкту на VPS:
#   bash deploy/deploy.sh                      # без домену: http://IP:5000
#   bash deploy/deploy.sh music.example.com    # з доменом: автоматичний HTTPS (Caddy + Let's Encrypt)
# Домен має вказувати (A-запис) на IP цього сервера, порти 80 і 443 мають бути відкриті.
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN_ARG="${1:-}"

# 1. Docker
if ! command -v docker &>/dev/null; then
  echo "[*] Встановлюю Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# 2. .env (секрети генеруються один раз і не перезаписуються)
if [ ! -f deploy/.env ]; then
  cp deploy/.env.example deploy/.env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" deploy/.env
  sed -i "s|^JWT_KEY=.*|JWT_KEY=$(openssl rand -base64 48 | tr -d '\n/+=')|" deploy/.env
  echo "[*] Створено deploy/.env з випадковими секретами"
fi

if [ -n "$DOMAIN_ARG" ]; then
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN_ARG|; s|^COMPOSE_PROFILES=.*|COMPOSE_PROFILES=https|; s|^APP_BIND=.*|APP_BIND=127.0.0.1|" deploy/.env
  echo "[*] HTTPS для $DOMAIN_ARG увімкнено"
fi

# 3. Збірка і запуск
echo "[*] Збираю та запускаю контейнери (перший раз це кілька хвилин)..."
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

DOMAIN_NOW=$(grep -E '^DOMAIN=' deploy/.env | cut -d= -f2-)
echo ""
if [ -n "$DOMAIN_NOW" ]; then
  echo "✅ Beatify запущено!  https://$DOMAIN_NOW   (сертифікат випускається за хвилину-дві)"
else
  echo "✅ Beatify запущено!  http://$(hostname -I | awk '{print $1}'):$(grep -E '^APP_PORT=' deploy/.env | cut -d= -f2-)"
fi
echo "   ⚠  Перший зареєстрований користувач стає адміністратором — зареєструйтесь першим."
echo "      Потім закрийте реєстрацію: ALLOW_REGISTRATION=false у deploy/.env і  bash deploy/update.sh"
echo "   Логи:     docker compose -f deploy/docker-compose.yml logs -f app"
echo "   Зупинити: docker compose -f deploy/docker-compose.yml down"

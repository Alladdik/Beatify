#!/usr/bin/env bash
# ── Beatify: перший запуск на VPS ─────────────────────────────────────────────
# Використання (з кореня проєкту на VPS):  bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. Docker
if ! command -v docker &>/dev/null; then
  echo "[*] Встановлюю Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# 2. .env
if [ ! -f deploy/.env ]; then
  cp deploy/.env.example deploy/.env
  # Згенерувати випадкові секрети
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" deploy/.env
  sed -i "s|^JWT_KEY=.*|JWT_KEY=$(openssl rand -base64 48 | tr -d '\n/+=')|" deploy/.env
  echo "[*] Створено deploy/.env з випадковими секретами"
fi

# 3. Збірка і запуск
echo "[*] Збираю та запускаю контейнери..."
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

echo ""
echo "✅ Beatify запущено!  http://$(hostname -I | awk '{print $1}'):5000"
echo "   Логи:     docker compose -f deploy/docker-compose.yml logs -f app"
echo "   Зупинити: docker compose -f deploy/docker-compose.yml down"

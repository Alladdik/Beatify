#!/usr/bin/env bash
# Приймає tar-потік зі stdin і розпаковує в том із треками. Викликається з upload-media.ps1:
#   tar -cf - -C server/wwwroot/uploads . | ssh root@VPS bash /opt/beatify/vps-deploy/receive-media.sh
# Файли лише додаються/перезаписуються — нічого не видаляється.
set -euo pipefail
INSTALL_DIR="${INSTALL_DIR:-/opt/beatify}"
COMPOSE="docker compose -f $INSTALL_DIR/deploy/docker-compose.yml --env-file $INSTALL_DIR/deploy/.env"

docker volume inspect beatify_uploads >/dev/null 2>&1 || { echo "Том beatify_uploads не існує — спершу bash install.sh"; exit 1; }
docker run --rm -i -v beatify_uploads:/data alpine tar -xf - -C /data
$COMPOSE exec -T -u root app chown -R app:app /app/wwwroot/uploads
echo "✅ Файли розпаковано в том beatify_uploads"

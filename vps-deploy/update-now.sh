#!/usr/bin/env bash
# Підтягнути нову версію з GitHub і перезібрати прямо зараз (не чекаючи cron).
set -euo pipefail
INSTALL_DIR="${INSTALL_DIR:-/opt/beatify}"
exec bash "$INSTALL_DIR/deploy/pull-update.sh" --force

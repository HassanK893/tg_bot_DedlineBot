#!/usr/bin/env bash
# Идемпотентный скрипт разворачивания/обновления DedlineBot на VPS.
# Первый запуск: ставит Docker/Nginx/certbot, создаёт .env со случайными
# паролями (спросит только BOT_TOKEN), поднимает контейнеры, выпускает SSL.
# Повторный запуск (после обновления кода): пропускает уже сделанные шаги,
# пересобирает и перезапускает только контейнер приложения.
#
# Запускать от root (или через sudo) из корня репозитория на самом VPS:
#   cd /opt/dedlinebot && sudo bash deploy/deploy.sh
set -euo pipefail

DOMAIN="skanix.ru"
EMAIL="hassank07@mail.ru"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"

echo "==> Каталог деплоя: $REPO_DIR"

# --- Docker -------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Устанавливаю Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Ошибка: не нашёл docker compose (плагин) после установки Docker." >&2
  exit 1
fi

# --- Nginx + certbot ------------------------------------------------------------
if ! command -v nginx >/dev/null 2>&1; then
  echo "==> Устанавливаю Nginx..."
  apt-get update -y
  apt-get install -y nginx
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "==> Устанавливаю certbot..."
  apt-get install -y certbot python3-certbot-nginx
fi

# --- .env (только при первом запуске) ------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  echo "==> Первый запуск — создаю $ENV_FILE"
  read -rp "Вставьте BOT_TOKEN от @BotFather: " BOT_TOKEN
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  WEBHOOK_SECRET="$(openssl rand -hex 24)"
  cat > "$ENV_FILE" <<EOF
BOT_TOKEN=${BOT_TOKEN}
PUBLIC_URL=https://${DOMAIN}
WEBHOOK_SECRET=${WEBHOOK_SECRET}
POSTGRES_USER=dedlinebot
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=dedlinebot
DATABASE_URL=postgresql://dedlinebot:${POSTGRES_PASSWORD}@postgres:5432/dedlinebot
REDIS_URL=redis://redis:6379
DEFAULT_TIMEZONE=Europe/Moscow
PORT=3000
NODE_ENV=production
EOF
  chmod 600 "$ENV_FILE"
  echo "==> $ENV_FILE создан (секреты сгенерированы автоматически)."
else
  echo "==> $ENV_FILE уже существует — использую как есть."
fi

# --- Nginx-конфиг ---------------------------------------------------------
if [ ! -f "/etc/nginx/sites-available/${DOMAIN}" ]; then
  echo "==> Ставлю Nginx-конфиг для ${DOMAIN}"
  cp "$REPO_DIR/deploy/nginx-${DOMAIN}.conf" "/etc/nginx/sites-available/${DOMAIN}"
  ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
  nginx -t
  systemctl reload nginx
fi

# --- контейнеры -----------------------------------------------------------------
echo "==> Собираю и запускаю контейнеры..."
cd "$REPO_DIR"
docker compose -f docker-compose.prod.yml up -d --build

# --- SSL ------------------------------------------------------------------------
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  echo "==> Выпускаю SSL-сертификат..."
  certbot --nginx -d "${DOMAIN}" -m "${EMAIL}" --agree-tos --redirect -n
else
  echo "==> Сертификат уже есть, пропускаю certbot."
fi

echo ""
echo "==> Готово. Проверка:"
echo "    curl -s https://${DOMAIN}/healthz"
echo "    docker compose -f docker-compose.prod.yml logs -f app"

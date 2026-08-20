#!/usr/bin/env bash
# Идемпотентный скрипт разворачивания/обновления DedlineBot на VPS.
#
# Бот работает на long polling — домен, TLS-сертификат и Nginx проекту не
# нужны. Всё, что делает скрипт: ставит Docker (если его нет), создаёт .env со
# случайным паролем базы (спросит только BOT_TOKEN) и поднимает контейнеры.
#
# Повторный запуск (после `git pull`): пропускает уже сделанные шаги,
# пересобирает контейнеры и накатывает новые миграции.
#
# Запускать от root (или через sudo) из корня репозитория на самом VPS:
#   cd /opt/dedlinebot && sudo bash deploy/deploy.sh
set -euo pipefail

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

# --- .env (только при первом запуске) ------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  echo "==> Первый запуск — создаю $ENV_FILE"
  read -rp "Вставьте BOT_TOKEN от @BotFather: " BOT_TOKEN
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  cat > "$ENV_FILE" <<EOF
BOT_TOKEN=${BOT_TOKEN}
POSTGRES_USER=dedlinebot
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=dedlinebot
DATABASE_URL=postgresql://dedlinebot:${POSTGRES_PASSWORD}@postgres:5432/dedlinebot
REDIS_URL=redis://redis:6379
PORT=3000
NODE_ENV=production
EOF
  chmod 600 "$ENV_FILE"
  echo "==> $ENV_FILE создан (пароль базы сгенерирован автоматически)."
else
  echo "==> $ENV_FILE уже существует — использую как есть."
fi

# --- контейнеры -----------------------------------------------------------------
echo "==> Собираю и запускаю контейнеры..."
cd "$REPO_DIR"
docker compose -f docker-compose.prod.yml up -d --build

# После пересборки старые слои остаются висеть безымянными и со временем
# съедают диск VPS — подчищаем.
docker image prune -f >/dev/null

echo ""
echo "==> Готово. Проверка:"
echo "    docker compose -f docker-compose.prod.yml ps"
echo "    docker compose -f docker-compose.prod.yml logs -f app"
echo ""
echo "    В логах должно быть: Бот запущен (polling): @<имя_бота>"

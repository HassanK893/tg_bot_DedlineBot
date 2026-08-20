# Разворачивание DedlineBot на VPS

Бот работает на **long polling**: он сам ходит в Telegram за апдейтами, а
входящие соединения ему не нужны. Поэтому проекту **не нужны ни домен, ни
TLS-сертификат, ни Nginx**. Приложение целиком живёт в контейнерах и наружу
никаких портов не открывает.

---

## Что нужно до начала

1. VPS на Ubuntu/Debian, доступ по SSH под root или через `sudo`.
2. **BOT_TOKEN** от @BotFather — скрипт спросит его один раз.
3. Исходящий интернет с сервера (к `api.telegram.org`). Больше ничего.

Docker ставить заранее не нужно — скрипт поставит сам, если его нет.

> **Один токен — один запущенный бот.** Пока прод работает, локальный
> `npm run bot` с тем же `BOT_TOKEN` запускать нельзя: два процесса начнут
> выхватывать апдейты друг у друга. Для разработки заведите у @BotFather
> отдельного тестового бота.

---

## Шаг 1. Положить код на сервер

```bash
sudo git clone <URL_вашего_репозитория> /opt/dedlinebot
```

---

## Шаг 2. Запустить деплой

```bash
cd /opt/dedlinebot && sudo bash deploy/deploy.sh
```

Скрипт:

1. ставит Docker (если его нет);
2. создаёт `/opt/dedlinebot/.env` — спросит только `BOT_TOKEN`, пароль базы
   сгенерирует сам;
3. собирает и поднимает контейнеры: Postgres, Redis, миграции, приложение.

---

## Шаг 3. Проверить

```bash
cd /opt/dedlinebot && docker compose -f docker-compose.prod.yml logs -f app
```

В логах должно быть:

```
HTTP-сервер слушает 0.0.0.0:3000 (наружу не опубликован)
Бот запущен (polling): @ваш_бот
```

После этого напишите боту `/start` в Telegram.

Состояние контейнеров:

```bash
cd /opt/dedlinebot && docker compose -f docker-compose.prod.yml ps
```

У `app` должно быть `Up (healthy)`, у `migrate` — `Exited (0)`.

---

## Сборка образов не на сервере

Если с сервера не достучаться до npm-реестра (`npm ci` виснет на `ETIMEDOUT`),
собирать образы на месте не получится. Тогда они собираются на другой машине и
переносятся готовыми.

**На машине, где сборка работает:**

```bash
docker build --platform linux/amd64 --provenance=false -t dedlinebot-migrate:latest --target build ./app
```

```bash
docker build --platform linux/amd64 --provenance=false -t dedlinebot-app:latest --target runtime ./app
```

```bash
docker save dedlinebot-app:latest dedlinebot-migrate:latest | gzip -1 > dedlinebot-images.tar.gz
```

Передать на сервер (~295 МБ):

```bash
scp dedlinebot-images.tar.gz ПОЛЬЗОВАТЕЛЬ@СЕРВЕР:/tmp/
```

**На сервере:**

```bash
sudo docker load -i /tmp/dedlinebot-images.tar.gz
```

```bash
cd /opt/dedlinebot && sudo bash deploy/deploy.sh --no-build
```

Флаг `--no-build` берёт загруженные образы вместо сборки на месте.

Архив после загрузки можно удалить:

```bash
rm /tmp/dedlinebot-images.tar.gz
```

## Обновление после изменений в коде

```bash
cd /opt/dedlinebot && sudo git pull && sudo bash deploy/deploy.sh
```

Повторный запуск идемпотентен: `.env` не трогается, пересобираются контейнеры
и накатываются новые миграции.

---

## Полезные команды

Перезапустить только приложение:

```bash
cd /opt/dedlinebot && docker compose -f docker-compose.prod.yml restart app
```

Логи миграций:

```bash
cd /opt/dedlinebot && docker compose -f docker-compose.prod.yml logs migrate
```

Бэкап базы:

```bash
cd /opt/dedlinebot && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U dedlinebot dedlinebot > ~/dedlinebot-$(date +%F).sql
```

Проверить HTTP-слой с самого сервера (наружу он не доступен):

```bash
curl -s http://127.0.0.1:3000/healthz
```

---

## IPv6 в Docker (нужен не везде)

На некоторых хостингах `api.telegram.org` и `registry.npmjs.org` отвечают
**только по IPv6**. Сам сервер при этом работает нормально, а контейнеры —
нет: docker-сети по умолчанию только IPv4, и соединение молча висит до таймаута.
Симптомы: `npm ci` падает с `ETIMEDOUT`, бот не может подключиться к Telegram.

Проверить:

```bash
sudo docker run --rm node:22-alpine node -e "require('https').get('https://api.telegram.org/bot000/getMe',r=>{console.log('OK',r.statusCode)}).on('error',e=>console.log('НЕТ СВЯЗИ:',e.message))"
```

Если `НЕТ СВЯЗИ`, а с самого сервера `curl https://api.telegram.org/` отвечает —
включите IPv6 у демона:

```bash
sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak 2>/dev/null; echo '{"ipv6": true, "fixed-cidr-v6": "fd00:d0c::/64", "ip6tables": true}' | sudo tee /etc/docker/daemon.json
```

```bash
sudo systemctl restart docker
```

`fd00:` — приватный диапазон, аналог `192.168.x.x` для IPv6. Контейнеры получают
выход наружу, но снаружи остаются недоступны.

Перезапуск демона на минуту роняет **все** контейнеры на сервере.

Откат:

```bash
sudo mv /etc/docker/daemon.json.bak /etc/docker/daemon.json && sudo systemctl restart docker
```

## Если что-то пошло не так

### Бот не отвечает, в логах `409 Conflict: terminated by other getUpdates request`

Значит, с этим же токеном где-то запущен ещё один экземпляр бота — скорее
всего локальный `npm run bot`. Остановите его. Для разработки нужен отдельный
токен.

### Приложение не стартует

```bash
cd /opt/dedlinebot && docker compose -f docker-compose.prod.yml logs migrate
```

Контейнер `app` намеренно не запускается, пока `migrate` не отработает
успешно, — чтобы приложение не работало с несовпадающей схемой БД.

### Проверить, что Telegram видит именно polling

Команда содержит токен, поэтому выполняйте её сами и никуда вывод не копируйте:

```bash
source /opt/dedlinebot/.env && curl -s "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

Поле `url` должно быть пустым (`""`). Если там адрес — на боте висит старый
webhook; приложение снимает его при старте само, достаточно перезапустить `app`.

---

## Как это устроено

```
                    исходящее соединение
контейнер app  ─────────────────────────────►  api.telegram.org
      │
      ├── Postgres (внутренняя сеть internal)
      └── Redis    (внутренняя сеть internal)

входящих соединений нет вообще — портов наружу не открыто
```

| Файл | Назначение |
|---|---|
| `docker-compose.prod.yml` | стек: postgres, redis, migrate, app |
| `app/Dockerfile` | двухстадийная сборка: `build` (сборка + миграции), `runtime` (то, что крутится) |
| `deploy/deploy.sh` | весь деплой одной командой, идемпотентен |
| `.env.production.example` | шаблон переменных окружения (реальный `.env` в git не попадает) |
| `app/src/prod.ts` | точка входа в проде: бот на polling'е + REST API + фоновые воркеры |

# Деплой DedlineBot на VPS (skanix.ru)

Я не могу подключиться к твоему VPS напрямую — весь раздел «На VPS» ты выполняешь
сам через SSH. Каждый блок — это то, что нужно скопировать целиком и вставить в
терминал.

Домен `skanix.ru` уже должен указывать A-записью на IP этого VPS — без этого
шаг с сертификатом (certbot) не пройдёт.

## Что это разворачивает

Один Docker-контейнер с ботом (webhook-режим вместо long polling) + REST API +
воркеры напоминаний, плюс Postgres и Redis в соседних контейнерах. Снаружи —
Nginx на самом VPS с TLS-сертификатом от Let's Encrypt, проксирующий
`https://skanix.ru` на контейнер приложения.

## 1. Перенести код на VPS (с твоей Windows-машины, Git Bash)

Из корня репозитория (`tg_bot_DedlineBot`):

```bash
tar --exclude='app/node_modules' --exclude='.git' --exclude='app/dist' --exclude='app/src/generated' -czf dedlinebot.tar.gz .
```

```bash
scp dedlinebot.tar.gz root@skanix.ru:/root/
```

(Если логин на VPS не `root` — подставь своего пользователя. Пароль/ключ спросит сам scp — как обычно логинишься по SSH.)

## 2. На VPS — распаковать и запустить

Подключись по SSH:

```bash
ssh root@skanix.ru
```

Дальше — всё одним блоком:

```bash
mkdir -p /opt/dedlinebot
tar -xzf /root/dedlinebot.tar.gz -C /opt/dedlinebot
cd /opt/dedlinebot
chmod +x deploy/deploy.sh
bash deploy/deploy.sh
```

Скрипт сам:
- поставит Docker, Nginx, certbot, если их ещё нет;
- один раз спросит **BOT_TOKEN** от @BotFather (единственное, что нужно ввести руками) и сгенерирует остальные пароли/секреты сам;
- поднимет Postgres, Redis и контейнер приложения (внутри контейнера сам применит миграции БД);
- настроит Nginx и выпустит SSL-сертификат.

В конце выведет две команды для проверки — выполни их там же:

```bash
curl -s https://skanix.ru/healthz
docker compose -f docker-compose.prod.yml logs -f app
```

`healthz` должен ответить `ok`. В логах ищи строку `Webhook установлен: ...` и
`prod-сервер слушает 127.0.0.1:3000` — если оба есть, бот должен отвечать в
Telegram. `Ctrl+C` выходит из просмотра логов, контейнеры продолжают работать.

## 3. Обновление кода после правок

Каждый раз, когда я меняю код локально и ты хочешь выкатить это на прод —
повторяешь шаг 1 (пересобрать архив, `scp`), потом на VPS:

```bash
tar -xzf /root/dedlinebot.tar.gz -C /opt/dedlinebot
cd /opt/dedlinebot
bash deploy/deploy.sh
```

`.env` на сервере уже существует — скрипт его не тронет, просто пересоберёт и
перезапустит контейнер приложения с новым кодом.

## Если что-то пошло не так

- **`curl .../healthz` не отвечает** — `docker compose -f docker-compose.prod.yml ps` (все три сервиса должны быть `Up`/`healthy`), затем `docker compose -f docker-compose.prod.yml logs app` за деталями ошибки.
- **certbot не смог выпустить сертификат** — почти всегда значит, что DNS `skanix.ru` ещё не указывает на этот VPS (проверить: `dig +short skanix.ru` должен вернуть IP этого сервера) или порт 80 закрыт файрволом (`ufw status`, при необходимости `ufw allow 80,443/tcp`).
- **Бот не отвечает в Telegram, но `/healthz` работает** — проверь, что вебхук реально зарегистрирован: `curl "https://api.telegram.org/bot<ТВОЙ_ТОКЕН>/getWebhookInfo"` (выполнять на самом VPS или у себя — токен подставляешь сам, мне его показывать не нужно). Поле `url` должно совпадать с `https://skanix.ru/telegram/webhook/<секрет>`, а `last_error_message` — быть пустым.
- **Хочешь откатиться на локальный long polling** — там ничего не менялось, `npm run bot` по-прежнему работает как раньше, эти два режима независимы (webhook только в `src/prod.ts`).

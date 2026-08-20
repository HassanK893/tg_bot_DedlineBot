# DedlineBot — конспект проекта (на 2026-08-15)

Портфолио-проект: Telegram-бот-напоминалка о периодических делах (оплата ЖКХ,
показания счётчиков, налоги и т.п.). Ключевая фишка — «rule engine»: два вида
периодичности (свои даты / интервал с 4 единицами), у каждого пользователя
свой часовой пояс, напоминания реально долетают через очередь, а не просто
показываются в UI. Полная история решений — в памяти агента (`MEMORY.md` +
файлы `dedlinebot-*.md`), этот файл — конспект для быстрого входа в код.

## Что где лежит

```
tg_bot_DedlineBot/
├── CLAUDE.md              — правила работы с .env (никогда не читать/писать без разрешения)
├── TZ.md                   — исходное ТЗ (источник истины по функционалу)
├── DEPLOY.md               — инструкция по разворачиванию на VPS
├── docker-compose.prod.yml — единственный compose: postgres + redis + migrate + app
├── deploy/                 — deploy.sh: весь деплой одной командой
└── app/
    ├── Dockerfile                 — двухстадийная сборка: build (сборка+миграции) / runtime
    ├── prisma/schema.prisma        — вся схема БД
    ├── .env / .env.example         — секреты (не коммитятся) / шаблон
    └── src/
        ├── prod.ts                — точка входа в проде (polling + REST + воркеры)
        ├── types/event.ts          — ЕДИНЫЙ источник истины по доменным типам
        ├── utils/occurrences.ts    — движок: расписание → список UTC-моментов отправки
        ├── utils/datePart.ts       — DatePart <-> Date для хранения (без часового пояса)
        ├── bot/                    — весь Telegram-слой (grammY)
        └── modules/{user,event,reminder}/  — весь бэкенд (Postgres+Redis+REST)
```

## Стек

- **grammY** (не Telegraf) + `@grammyjs/conversations` — многошаговые диалоги.
- **Postgres** через **Prisma 7** (`@prisma/adapter-pg`).
- **Redis** + **BullMQ** — очередь напоминаний (по одной delayed-job на каждый вычисленный момент).
- **Express 5** — REST API поверх тех же модулей (архитектурная демонстрация, бот его не вызывает — работает с сервисами напрямую в одном процессе).
- **luxon** — единственное место с часовыми поясами (`utils/occurrences.ts`).
- **zod** — валидация тел HTTP-запросов.

## Как запустить локально

Отдельного дев-compose в репозитории нет (проект приведён к прод-состоянию).
Postgres и Redis для локальной работы нужно поднять самому — любым способом,
главное указать реальные адреса в `app/.env`. Разово это делается так:

```bash
docker run -d --name dedlinebot-pg -p 5433:5432 -e POSTGRES_USER=dedlinebot -e POSTGRES_PASSWORD=dedlinebot -e POSTGRES_DB=dedlinebot postgres:16-alpine
```

```bash
docker run -d --name dedlinebot-redis -p 6379:6379 redis:7-alpine
```

Порт 5433, а не 5432 — на этой машине 5432 занят нативным Postgres-сервисом Windows.
Дальше:

```bash
cd app && npx prisma migrate dev && npm run bot
```

И локально (`src/bot/index.ts`), и в проде (`src/prod.ts`) бот работает на long
polling — сам ходит за апдейтами, домен и HTTPS не нужны. Разница только в
обвязке: в проде добавлены Express с REST API и `/healthz`. Общая часть —
фабрика `bot/createBot.ts`, так что хендлеры не дублируются.

**На одном токене может работать только один процесс.** Если прод запущен,
локальный `npm run bot` с тем же `BOT_TOKEN` начнёт выхватывать у него апдейты
(в логах — `409 Conflict`). Для разработки нужен отдельный тестовый бот.

`app/.env` должен содержать `BOT_TOKEN`, `DATABASE_URL` (порт 5433!), `REDIS_URL`, `PORT` — шаблон в `app/.env.example`.

## Слой bot/ (Telegram)

| Файл | Роль |
|---|---|
| `index.ts` | Точка входа: регистрирует все conversation'ы и callback-хендлеры, запускает воркер напоминаний, `/start`/`/menu` |
| `calendar.ts` | Все inline-клавиатуры для дат/времени/чисел/дней недели — чистые билдеры без бизнес-логики |
| `eventSteps.ts` | **Переиспользуемые примитивы визарда** — pickCalendarDate, runCustomDatesFlow, runIntervalFlow, `runDateAndScheduleFlow` (даты+расписание одним блоком) и `summarizeDraft` (рендер полей события). Общие для создания И редактирования |
| `wizard.ts` | Оркестрация создания события (8 шагов) — почти вся логика делегирована в eventSteps.ts, тут только последовательность + персист в БД |
| `editWizard.ts` | Точечное редактирование полей уже созданного события — переиспользует те же примитивы из eventSteps.ts |
| `eventsMenu.ts` | «Мои события»: список/карточка/пауза/резюм/удаление — ПЛОСКИЕ callback-хендлеры (не conversation, свободного ввода нет) |
| `onboarding.ts` + `timezone.ts` | Выбор часового пояса при первом /start (курированный список RU/СНГ зон) |
| `mainMenu.ts` | Текст и клавиатура главного меню |

**Важно про grammY conversations:** любой вызов Prisma/Redis внутри функции-conversation обёрнут в `conversation.external(() => ...)` — иначе побочный эффект повторился бы при каждом реплее диалога. В `eventsMenu.ts` (плоские хендлеры) это не нужно.

## Слой modules/ (бэкенд, вертикальные срезы)

Для каждой сущности: `*.model.ts` (Prisma + Redis/BullMQ операции) → `*.service.ts`
(бизнес-логика) → `*.controller.ts` + `*.routes.ts` (HTTP). Общий `routes/index.ts`
монтирует всё под `/api`.

- **user** — `getOrCreateUser`/`setTimezone` по `telegramId` (bigint, единственная идентификация).
- **event** — персист `EventDraft`, `toDraftShape()` (обратное превращение БД-записи в форму визарда — нужно для «Возобновить» и «Редактировать»), pause/resume/delete/updateSchedule (последнее — полный пересчёт напоминаний).
- **reminder** — `reminder.model.ts` держит и Postgres (таблица `Reminder`), и BullMQ-очередь; `reminder.worker.ts` — воркер, вызывается из `bot/index.ts` с колбэком отправки через `bot.api`.

## Модель данных (кратко)

```
User(telegramId unique, timezone?) 1—n Event
Event(kind: ONCE|MONTHLY, startDate/endDate, scheduleType: CUSTOM|INTERVAL, state: ACTIVE|PAUSED)
  1—n EventCustomDate 1—n EventCustomTime   (свои даты, несколько времён на дату)
  1—1 EventIntervalSchedule (unit: HOURS|DAYS|WEEKS|MONTHS, every, time?, weekday?, dayOfMonth?)
  1—n Reminder(firesAt UTC, status: PENDING|SENT|FAILED|CANCELLED, jobId)
```

Напоминания НЕ пересчитываются на лету — при создании/резюме/правке заранее
материализуется весь список будущих `Reminder`-строк, и на каждую сразу
ставится BullMQ-задача. Пауза = снять pending-задачи из очереди + пометить
CANCELLED. Резюм/правка = пересчитать заново, взять только моменты `> now`.

## Что НЕ реализовано

- Финальное название бота не выбрано.
- CI/CD (сейчас деплой ручной: `git pull` + `deploy/deploy.sh` на сервере).

Подробности и история решений — в памяти агента (папка `memory/dedlinebot-*.md`
в профиле Claude Code), в частности `dedlinebot-db-schema.md` и
`dedlinebot-stack-and-testing.md` — самые актуальные.

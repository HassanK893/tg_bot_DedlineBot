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

Раскладка повторяет [bot-base/telegram-bot-template](https://github.com/bot-base/telegram-bot-template)
— распространённую структуру для grammY. Смысл: каждый кусок поведения бота
живёт в своём файле в `features/` и ничего не знает о соседях, а порядок
middleware задаётся в одном месте — `index.ts`.

```
bot/
├── callback-data/   строки callback_data: и сборка, и разбор в одном месте
├── features/        по файлу на кусок поведения, каждый экспортирует Composer
├── filters/         предикаты по данным кнопки
├── handlers/        обработчик ошибок + разовый setMyCommands
├── helpers/         общий UI-код визардов
├── keyboards/       чистые билдеры клавиатур
├── middlewares/     сквозные обёртки (лог апдейтов)
├── context.ts       типы контекста
└── index.ts         createBot(): порядок middleware и подключение features
```

| Файл | Роль |
|---|---|
| `index.ts` | `createBot()` — единственное место, где задан порядок middleware. Ни транспорта, ни воркеров: их поднимают точки входа `src/dev.ts` и `src/prod.ts` |
| `context.ts` | Два типа контекста: `Context` снаружи визарда (есть `ctx.conversation`) и `ConversationContext` внутри (его нет). Путать нельзя |
| `features/main-menu.ts` | `/start`, `/menu`, возврат в меню |
| `features/create-event.ts` | Визард создания события (8 шагов) + вход в него |
| `features/edit-event.ts` | Точечное редактирование полей — те же примитивы, что и при создании |
| `features/events-menu.ts` | «Мои события»: список/карточка/пауза/резюм/удаление/Done — ПЛОСКИЕ хендлеры, не conversation (свободного ввода нет) |
| `features/timezone.ts` | Выбор часового пояса при первом `/start` и из настроек |
| `features/help.ts` | `/info` и `/test` |
| `features/unhandled.ts` | Текст вне визарда. **Подключать только последним** — ловит любое сообщение |
| `helpers/event-steps.ts` | **Переиспользуемые примитивы визарда** — `pickCalendarDate`, `runCustomDatesFlow`, `runIntervalFlow`, `runDateAndScheduleFlow`, `summarizeDraft`. Общие для создания И редактирования |
| `callback-data/` | Строки `callback_data`: и сборка, и разбор в одном месте |
| `keyboards/calendar.ts` | Клавиатуры дат/времени/чисел/дней недели — чистые билдеры без бизнес-логики |
| `keyboards/main-menu.ts` | Текст и клавиатура главного меню + гашение устаревших копий |
| `keyboards/timezone.ts` | Курированный список зон RU/СНГ |

**Важно про grammY conversations:** любой вызов Prisma/Redis внутри
функции-conversation обёрнут в `conversation.external(() => ...)` — иначе
побочный эффект повторился бы при каждом реплее диалога. В
`features/events-menu.ts` (плоские хендлеры) это не нужно.

**Важно про порядок:** все три `createConversation(...)` подключены в
`index.ts` выше любого хендлера. Войти в диалог можно только если его
middleware уже отработал в этой цепочке — иначе `/start` не смог бы войти в
`selectTimezone`, объявленный в другом файле.

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

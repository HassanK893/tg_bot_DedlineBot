# Точка отката — 2026-08-14, до подключения бэкенда

Этот файл фиксирует состояние проекта **прямо перед** тем, как в него добавили
Postgres/Redis/Express-модули. Если новая реализация не понравится — можно
откатиться к коммиту с сообщением `checkpoint: wizard UI without backend`
(`git log` или `git tag` — см. ниже) и вернуться ровно к этому интерфейсу.

## Что уже работает (визард, без сохранения в БД)

Бот на grammY, вся логика диалога — в `app/src/bot/`:

- **`index.ts`** — точка входа: токен из `.env`, `/start` и `/menu` показывают
  главное меню, `bot.use(conversations())` + `createConversation(createEventConversation, "createEvent")`.
- **`mainMenu.ts`** — «Добро пожаловать, {имя}» + кнопки «📋 Мои события» / «➕ Создать событие».
  «Мои события» — заглушка («Событий пока нет»), ничего не хранит.
- **`calendar.ts`** — все переиспользуемые inline-клавиатуры: обычный календарь
  со свободной навигацией (`buildCalendar`, теперь с блокировкой прошлого —
  🚫 вместо «‹», дни до сегодня гасятся точкой), календарь одного зафиксированного
  месяца (`buildFixedMonthCalendar`), выбор месяца год+месяц (`buildYearMonthPicker`,
  та же блокировка прошлого), мультивыбор дат (`buildCustomDatePicker`), сетка
  времени с шагом 30 мин (`buildTimePicker`), сетка чисел (`buildNumberPicker`),
  выбор дня недели (`buildWeekdayPicker`).
- **`wizard.ts`** — весь визард создания события как «живая форма»
  (`editMessageText` с `parse_mode: "HTML"`, HTML-иконки, доступные поля жирным).
  8 шагов: Название → Описание → Текст напоминаний → Фото (опционально) →
  Тип (Разовое/Ежемесячное) → Дата начала → Дата окончания → Настройка напоминаний.
  Разовое — свободный календарь на любой диапазон месяцев. Ежемесячное — сперва
  фиксируется один месяц (год+месяц), потом внутри него выбираются день начала
  и день конца (может быть один и тот же день).
  Напоминания — два режима:
  - **«Свои даты»** — многократный выбор дат в диапазоне start..end, для каждой
    даты можно накопить НЕСКОЛЬКО времён (сетка + свой ввод текстом), «Готово»
    завершает список дат.
  - **«Интервал»** — единица интервала (часы/дни/недели/месяцы, доступность
    зависит от длины диапазона start..end, месяцы никогда не предлагаются для
    ежемесячного типа), число повторов, для дней/недель/месяцев ещё время суток,
    для недель ещё день недели, для месяцев ещё число месяца.
  По завершении визард **ничего не сохраняет** — просто показывает финальный
  экран «✅ Событие успешно создано» с текстом
  «Сохранение в базу пока не подключено — это проверка сценария создания.» и
  кнопкой «🏠 В главное меню».

Все данные визарда живут только в памяти процесса, в объекте `EventDraft`
внутри одного вызова `createEventConversation` — при перезапуске бота теряются.

## Ключевые типы (актуальны на момент чекпоинта)

```ts
type EventKind = "once" | "monthly";
type ScheduleType = "custom" | "interval";
interface DatePart { year: number; month: number; day: number }
interface CustomDateEntry { date: DatePart; times: string[] }
type IntervalUnit = "hours" | "days" | "weeks" | "months";
interface IntervalSchedule {
  unit: IntervalUnit;
  every: number;
  time?: string;      // ЧЧ:ММ — для всех единиц, кроме часов
  weekday?: number;    // 0=Пн..6=Вс — только для unit="weeks"
  dayOfMonth?: number; // 1-31 — только для unit="months"
}
interface EventDraft {
  name?: string; description?: string; reminderText?: string;
  photoFileId?: string; kind?: EventKind;
  startDate?: DatePart; endDate?: DatePart;
  scheduleType?: ScheduleType;
  customDates?: CustomDateEntry[];
  intervalSchedule?: IntervalSchedule;
}
```

## Что не реализовано на этот момент

- Никакой базы данных — `app/prisma/schema.prisma` пустой (только generator/datasource).
- Нет мультипользовательской логики сверх того, что Telegram и так разделяет чаты.
- Нет часового пояса — все времена просто текстовые метки без часового пояса.
- Нет реальной отправки напоминаний — только UI их настройки.
- «Мои события», редактирование, пауза, удаление — не существуют.
- В `app/src/` уже лежит **не относящийся к DedlineBot** каркас (Express +
  Prisma + JWT + S3), скопированный из другого шаблона автора: рабочий
  `functionWrapper`/`dbFunctionWrapper`/`AppError`/`AppSuccess`, но
  `types/express.d.ts` ссылается на несуществующий `modules/scan` — из-за
  этого `tsc` до сих пор падал вне `src/bot/**`. Это не было в скоупе визарда.

## Как откатиться

```bash
git log --oneline
git checkout <hash-коммита-checkpoint> -- app/src/bot CHECKPOINT.md
```

или полностью:

```bash
git reset --hard <hash-коммита-checkpoint>
```

(если бэкенд-коммиты уже запушены куда-то — сначала `git branch backup-backend`,
чтобы не потерять эту работу).

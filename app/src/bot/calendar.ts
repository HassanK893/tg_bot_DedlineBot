import { InlineKeyboard } from "grammy";

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Родительный падеж — для дат вида «15 августа 2026», не для заголовка. */
const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** Telegram не принимает кнопку с пустой подписью — для пустых клеток нужен символ. */
const EMPTY_CELL = "·";

export function monthTitle(year: number, month: number): string {
  return `${MONTHS[month] ?? "?"} ${year}`;
}

export function formatDate(d: { year: number; month: number; day: number }): string {
  return `${d.day} ${MONTHS_GENITIVE[d.month] ?? "?"} ${d.year}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface CalendarRange {
  /** Дни раньше этой даты показываются пустой неактивной клеткой. */
  min?: CalendarDate;
  /** Дни позже этой даты показываются пустой неактивной клеткой. */
  max?: CalendarDate;
}

function toUtcMs(d: CalendarDate): number {
  return Date.UTC(d.year, d.month, d.day);
}

function isWithinRange(year: number, month: number, day: number, range?: CalendarRange): boolean {
  if (!range) return true;
  const ms = toUtcMs({ year, month, day });
  if (range.min && ms < toUtcMs(range.min)) return false;
  if (range.max && ms > toUtcMs(range.max)) return false;
  return true;
}

function isMarked(year: number, month: number, day: number, marked?: CalendarDate[]): boolean {
  return marked?.some((d) => d.year === year && d.month === month && d.day === day) ?? false;
}

/** Поднимает нижнюю границу диапазона до today, если она была раньше или отсутствовала. */
function mergeMinToday(range: CalendarRange | undefined, today?: CalendarDate): CalendarRange | undefined {
  if (!today) return range;
  const min = range?.min && toUtcMs(range.min) > toUtcMs(today) ? range.min : today;
  return { ...range, min };
}

/**
 * Сетка чисел месяца (без заголовка) — общая часть для обычного календаря и
 * для календаря, зафиксированного на одном месяце.
 * callback_data:
 *   cal:day:<year>:<month>:<day> — выбор даты
 *   cal:noop — неактивная клетка
 *
 * marked — дни, уже выбранные раньше (например, в наборе «своих дат»):
 * рисуются с галочкой и становятся некликабельными, чтобы не выбрать дважды.
 */
function appendDayGrid(
  kb: InlineKeyboard,
  year: number,
  month: number,
  range?: CalendarRange,
  marked?: CalendarDate[],
) {
  for (const name of WEEKDAYS) kb.text(name, "cal:noop");
  kb.row();

  // getUTCDay(): 0 — воскресенье, поэтому сдвигаем к понедельнику
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  let cell = 0;
  for (let i = 0; i < firstWeekday; i++) {
    kb.text(EMPTY_CELL, "cal:noop");
    cell++;
  }
  for (let day = 1; day <= daysInMonth; day++) {
    if (isMarked(year, month, day, marked)) {
      kb.text(`✓${day}`, "cal:noop");
    } else if (isWithinRange(year, month, day, range)) {
      kb.text(String(day), `cal:day:${year}:${month}:${day}`);
    } else {
      kb.text(EMPTY_CELL, "cal:noop");
    }
    cell++;
    if (cell % 7 === 0) kb.row();
  }
  while (cell % 7 !== 0) {
    kb.text(EMPTY_CELL, "cal:noop");
    cell++;
  }
  kb.row();
}

/**
 * Обычный календарь со свободной навигацией по месяцам.
 * callback_data: cal:nav:<year>:<month> — переключение месяца, плюс всё из appendDayGrid.
 *
 * range ограничивает, какие числа кликабельны — дни вне диапазона рисуются
 * пустой клеткой, как будто их вовсе нет в сетке.
 *
 * today, если передан, запрещает уйти в прошлое — по тому же принципу, что и
 * buildYearMonthPicker: стрелка «‹» становится неактивной (🚫), когда левее
 * уже некуда, а дни раньше today внутри текущего месяца рисуются пустой
 * клеткой (через merge в range).
 */
export function buildCalendar(
  year: number,
  month: number,
  range?: CalendarRange,
  today?: CalendarDate,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const prevBlocked =
    today !== undefined &&
    (prev.year < today.year || (prev.year === today.year && prev.month < today.month));
  if (prevBlocked) {
    kb.text("🚫", "cal:noop");
  } else {
    kb.text("‹", `cal:nav:${prev.year}:${prev.month}`);
  }
  kb.text(monthTitle(year, month), "cal:noop").text("›", `cal:nav:${next.year}:${next.month}`).row();

  appendDayGrid(kb, year, month, mergeMinToday(range, today));

  kb.text("← В меню", "menu:main");
  return kb;
}

/**
 * Календарь одного зафиксированного месяца — без стрелок переключения.
 * Используется, когда месяц уже выбран отдельным шагом (buildYearMonthPicker)
 * и дальше в нём выбираются только дни.
 */
export function buildFixedMonthCalendar(
  year: number,
  month: number,
  range?: CalendarRange,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  kb.text(monthTitle(year, month), "cal:noop").row();

  appendDayGrid(kb, year, month, range);

  kb.text("← В меню", "menu:main");
  return kb;
}

/**
 * Календарь для многократного выбора «своих дат» (режим напоминаний
 * «Свои даты»). Отличается от обычного календаря двумя вещами: уже
 * выбранные дни показываются галочкой (marked), и снизу добавлены свои
 * управляющие кнопки вместо одной «← В меню».
 * callback_data (сверх cal:day / cal:nav / cal:noop):
 *   custom:done — завершить набор дат, перейти дальше
 *   sched:back — вернуться к выбору режима напоминаний (свои даты / интервал)
 */
export function buildCustomDatePicker(
  year: number,
  month: number,
  options: {
    /** true — без стрелок переключения месяца (месяц уже зафиксирован). */
    fixed: boolean;
    range?: CalendarRange;
    marked?: CalendarDate[];
    /** Показывать ли кнопку «Готово» — только когда набор дат не пуст. */
    canFinish: boolean;
  },
): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (options.fixed) {
    kb.text(monthTitle(year, month), "cal:noop").row();
  } else {
    const prev = shiftMonth(year, month, -1);
    const next = shiftMonth(year, month, 1);
    kb.text("‹", `cal:nav:${prev.year}:${prev.month}`)
      .text(monthTitle(year, month), "cal:noop")
      .text("›", `cal:nav:${next.year}:${next.month}`)
      .row();
  }

  appendDayGrid(kb, year, month, options.range, options.marked);

  if (options.canFinish) kb.text("✅ Готово", "custom:done").row();
  kb.text("↩ Сменить режим", "sched:back").row();
  kb.text("← В меню", "menu:main");
  return kb;
}

const TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
});

/**
 * Сетка времени с шагом 30 минут (00:00–23:30) плюс кнопка свободного ввода
 * для времени, которого нет в сетке. На одну дату можно выбрать несколько
 * времён — уже выбранные (marked) показываются галочкой и становятся
 * некликабельными, чтобы не добавить одно и то же дважды.
 * callback_data:
 *   time:pick:<HH:MM> — выбор слота
 *   time:manual — переход к вводу времени текстом
 *   time:noop — неактивная (уже выбранная) клетка
 *   times:done — закончить выбор времени для текущей даты
 */
export function buildTimePicker(marked?: string[], canFinish?: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();

  TIME_SLOTS.forEach((slot, i) => {
    if (marked?.includes(slot)) {
      kb.text(`✓${slot}`, "time:noop");
    } else {
      kb.text(slot, `time:pick:${slot}`);
    }
    if (i % 4 === 3) kb.row();
  });

  kb.text("✍️ Ввести своё время", "time:manual").row();
  if (canFinish) kb.text("✅ Готово", "times:done").row();
  kb.text("← В меню", "menu:main");
  return kb;
}

/**
 * Простая сетка чисел min..max — используется для «раз в N часов/дней» в
 * интервальном режиме напоминаний.
 * callback_data: int:num:<n>
 */
export function buildNumberPicker(min: number, max: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  let cell = 0;
  for (let n = min; n <= max; n++) {
    kb.text(String(n), `int:num:${n}`);
    cell++;
    if (cell % 6 === 0) kb.row();
  }
  if (cell % 6 !== 0) kb.row();
  kb.text("← В меню", "menu:main");
  return kb;
}

/**
 * Выбор дня недели — используется в интервальном режиме напоминаний для
 * unit="weeks" («раз в N недель, по такому-то дню»).
 * callback_data: wd:pick:<0..6> — 0=Пн..6=Вс.
 */
export function buildWeekdayPicker(): InlineKeyboard {
  const kb = new InlineKeyboard();
  WEEKDAYS.forEach((name, i) => kb.text(name, `wd:pick:${i}`));
  kb.row().text("← В меню", "menu:main");
  return kb;
}

/**
 * Выбор месяца: год сверху с навигацией стрелками, под ним сетка из 12
 * месяцев этого года. Используется, когда сначала нужно закрепить месяц, а
 * дни внутри него выбираются отдельным шагом (см. buildFixedMonthCalendar).
 * callback_data:
 *   ym:nav:<year> — переключение года
 *   ym:pick:<year>:<month> — выбор месяца
 *   ym:noop — неактивная клетка
 *
 * today, если передан, запрещает уйти в прошлое: стрелка «‹» становится
 * неактивной, когда левее уже некуда (текущий год), а месяцы раньше
 * текущего в текущем году показываются прочерком вместо названия.
 */
export function buildYearMonthPicker(
  year: number,
  today?: { year: number; month: number },
): InlineKeyboard {
  const kb = new InlineKeyboard();

  const canGoBack = !today || year - 1 >= today.year;
  if (canGoBack) {
    kb.text("‹", `ym:nav:${year - 1}`);
  } else {
    kb.text("🚫", "ym:noop");
  }
  kb.text(String(year), "ym:noop").text("›", `ym:nav:${year + 1}`).row();

  MONTHS.forEach((name, month) => {
    const isPast = today && (year < today.year || (year === today.year && month < today.month));
    if (isPast) {
      kb.text("—", "ym:noop");
    } else {
      kb.text(name, `ym:pick:${year}:${month}`);
    }
    if (month % 3 === 2) kb.row();
  });

  kb.text("← В меню", "menu:main");
  return kb;
}

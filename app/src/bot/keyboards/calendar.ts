import { InlineKeyboard } from "grammy";
import type { DatePart } from "../../types/event.js";
import { dateSortKey, daysInMonth } from "../../utils/datePart.js";
import { MENU } from "../callback-data/menu.js";
import { CAL_NOOP, CUSTOM_DONE, SCHEDULE, calDayData, calNavData } from "../callback-data/wizard.js";
import { WEEKDAYS, monthTitle } from "../helpers/date-format.js";

/**
 * Календари — три клавиатуры поверх одной сетки дней (appendDayGrid).
 * Остальные пикеры визарда лежат рядом: выбор месяца — keyboards/year-month.ts,
 * время — keyboards/time-picker.ts, числа и дни недели —
 * keyboards/number-picker.ts.
 */

/** Telegram не принимает кнопку с пустой подписью — для пустых клеток нужен символ. */
const EMPTY_CELL = "·";

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** Календарь оперирует ровно той же датой, что и остальной домен, — отдельного типа не заводим. */
export type CalendarDate = DatePart;

export interface CalendarRange {
  /** Дни раньше этой даты показываются пустой неактивной клеткой. */
  min?: CalendarDate;
  /** Дни позже этой даты показываются пустой неактивной клеткой. */
  max?: CalendarDate;
}

function isWithinRange(year: number, month: number, day: number, range?: CalendarRange): boolean {
  if (!range) return true;
  const ms = dateSortKey({ year, month, day });
  if (range.min && ms < dateSortKey(range.min)) return false;
  if (range.max && ms > dateSortKey(range.max)) return false;
  return true;
}

function isMarked(year: number, month: number, day: number, marked?: CalendarDate[]): boolean {
  return marked?.some((d) => d.year === year && d.month === month && d.day === day) ?? false;
}

/** Поднимает нижнюю границу диапазона до today, если она была раньше или отсутствовала. */
function mergeMinToday(range: CalendarRange | undefined, today?: CalendarDate): CalendarRange | undefined {
  if (!today) return range;
  const min = range?.min && dateSortKey(range.min) > dateSortKey(today) ? range.min : today;
  return { ...range, min };
}

/**
 * Строка заголовка: «‹ Месяц Год ›». prevBlocked — левая стрелка неактивна
 * (🚫), когда листать назад уже некуда.
 */
function appendMonthHeader(kb: InlineKeyboard, year: number, month: number, prevBlocked: boolean) {
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  if (prevBlocked) {
    kb.text("🚫", CAL_NOOP);
  } else {
    kb.text("‹", calNavData(prev.year, prev.month));
  }
  kb.text(monthTitle(year, month), CAL_NOOP).text("›", calNavData(next.year, next.month)).row();
}

/** Заголовок без стрелок — месяц зафиксирован, листать нельзя. */
function appendFixedMonthHeader(kb: InlineKeyboard, year: number, month: number) {
  kb.text(monthTitle(year, month), CAL_NOOP).row();
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
  for (const name of WEEKDAYS) kb.text(name, CAL_NOOP);
  kb.row();

  // getUTCDay(): 0 — воскресенье, поэтому сдвигаем к понедельнику
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const dayCount = daysInMonth(year, month);

  let cell = 0;
  for (let i = 0; i < firstWeekday; i++) {
    kb.text(EMPTY_CELL, CAL_NOOP);
    cell++;
  }
  for (let day = 1; day <= dayCount; day++) {
    if (isMarked(year, month, day, marked)) {
      kb.text(`✓${day}`, CAL_NOOP);
    } else if (isWithinRange(year, month, day, range)) {
      kb.text(String(day), calDayData(year, month, day));
    } else {
      kb.text(EMPTY_CELL, CAL_NOOP);
    }
    cell++;
    if (cell % 7 === 0) kb.row();
  }
  while (cell % 7 !== 0) {
    kb.text(EMPTY_CELL, CAL_NOOP);
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
  const prevBlocked =
    today !== undefined &&
    (prev.year < today.year || (prev.year === today.year && prev.month < today.month));
  appendMonthHeader(kb, year, month, prevBlocked);

  appendDayGrid(kb, year, month, mergeMinToday(range, today));

  kb.text("← В меню", MENU.main);
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

  appendFixedMonthHeader(kb, year, month);

  appendDayGrid(kb, year, month, range);

  kb.text("← В меню", MENU.main);
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
    appendFixedMonthHeader(kb, year, month);
  } else {
    appendMonthHeader(kb, year, month, false);
  }

  appendDayGrid(kb, year, month, options.range, options.marked);

  if (options.canFinish) kb.text("✅ Готово", CUSTOM_DONE).row();
  kb.text("↩ Сменить режим", SCHEDULE.back).row();
  kb.text("← В меню", MENU.main);
  return kb;
}

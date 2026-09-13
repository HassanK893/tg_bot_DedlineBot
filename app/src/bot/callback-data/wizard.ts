import type { DatePart, IntervalUnit } from "../../types/event.js";

/**
 * callback_data шагов визарда (создание и редактирование события). Строки
 * собираются здесь и только здесь: клавиатуры (keyboards/) строят кнопки через
 * эти функции, а шаги (helpers/steps/) разбирают ответ через parse*. Формат
 * живёт в одном месте — опечатка в литерале ломает сборку, а не работу бота.
 */

/** «Пропустить» на необязательных шагах (фото). */
export const STEP_SKIP = "step:skip";

/** Шаг «Тип события». */
export const EVENT_TYPE = {
  once: "type:once",
  monthly: "type:monthly",
} as const;

/** Выбор режима напоминаний и возврат к нему изнутри режима. */
export const SCHEDULE = {
  custom: "sched:custom",
  interval: "sched:interval",
  back: "sched:back",
} as const;

/** Режим «Свои даты»: закончить набор дат, перейти дальше. */
export const CUSTOM_DONE = "custom:done";

// --- календарь (keyboards/calendar.ts) ---------------------------------------

/** Неактивная клетка календаря (подпись дня недели, пустая ячейка, заголовок). */
export const CAL_NOOP = "cal:noop";

export function calNavData(year: number, month: number): string {
  return `cal:nav:${year}:${month}`;
}

export function calDayData(year: number, month: number, day: number): string {
  return `cal:day:${year}:${month}:${day}`;
}

const CAL_NAV_PATTERN = /^cal:nav:(-?\d+):(-?\d+)$/;
const CAL_DAY_PATTERN = /^cal:day:(-?\d+):(-?\d+):(-?\d+)$/;

export function parseCalNav(data: string): { year: number; month: number } | null {
  const nav = data.match(CAL_NAV_PATTERN);
  return nav ? { year: Number(nav[1]), month: Number(nav[2]) } : null;
}

export function parseCalDay(data: string): DatePart | null {
  const day = data.match(CAL_DAY_PATTERN);
  return day ? { year: Number(day[1]), month: Number(day[2]), day: Number(day[3]) } : null;
}

// --- выбор месяца (keyboards/year-month.ts) ----------------------------------

export const YM_NOOP = "ym:noop";

export function ymNavData(year: number): string {
  return `ym:nav:${year}`;
}

export function ymPickData(year: number, month: number): string {
  return `ym:pick:${year}:${month}`;
}

const YM_NAV_PATTERN = /^ym:nav:(-?\d+)$/;
const YM_PICK_PATTERN = /^ym:pick:(-?\d+):(\d+)$/;

export function parseYmNav(data: string): number | null {
  const nav = data.match(YM_NAV_PATTERN);
  return nav ? Number(nav[1]) : null;
}

export function parseYmPick(data: string): { year: number; month: number } | null {
  const pick = data.match(YM_PICK_PATTERN);
  return pick ? { year: Number(pick[1]), month: Number(pick[2]) } : null;
}

// --- время (keyboards/time-picker.ts) ----------------------------------------

/** Неактивная (уже выбранная) клетка сетки времени. */
export const TIME_NOOP = "time:noop";
/** Переход к вводу времени текстом. */
export const TIME_MANUAL = "time:manual";
/** Закончить выбор времени для текущей даты. */
export const TIMES_DONE = "times:done";

export function timePickData(slot: string): string {
  return `time:pick:${slot}`;
}

const TIME_PICK_PATTERN = /^time:pick:(\d{2}:\d{2})$/;

export function parseTimePick(data: string): string | null {
  const slot = data.match(TIME_PICK_PATTERN)?.[1];
  return slot ?? null;
}

// --- интервал (keyboards/number-picker.ts, keyboards/wizard.ts) --------------

export function intervalUnitData(unit: IntervalUnit): string {
  return `int:unit:${unit}`;
}

export function intNumData(n: number): string {
  return `int:num:${n}`;
}

export function weekdayPickData(index: number): string {
  return `wd:pick:${index}`;
}

/** Шаблоны с одной захватывающей группой-числом — см. waitNumericPick. */
export const INT_NUM_PATTERN = /^int:num:(\d+)$/;
export const WEEKDAY_PICK_PATTERN = /^wd:pick:(\d)$/;

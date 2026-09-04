import type { DatePart } from "../types/event.js";

/**
 * DatePart <-> Postgres `@db.Date` — хранится как UTC-полночь, без часового
 * пояса (это чистая календарная дата, тот же принцип, что и в bot/keyboards/calendar.ts
 * через Date.UTC). Не путать с utils/occurrences.ts, где даты уже привязаны
 * к часовому поясу пользователя ради момента отправки.
 */
export function datePartToUtcDate(d: DatePart): Date {
  return new Date(Date.UTC(d.year, d.month, d.day));
}

export function utcDateToDatePart(date: Date): DatePart {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

/**
 * Календарная дата одним числом — для сравнения и сортировки дат без времени.
 * Общая точка для UI-календаря (bot/keyboards/calendar.ts) и логики визарда
 * (bot/helpers/event-steps.ts, bot/features/edit-event.ts).
 */
export function dateSortKey(d: DatePart): number {
  return Date.UTC(d.year, d.month, d.day);
}

/** Сколько дней в месяце: «день 0» следующего месяца — это последний день текущего. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Сдвигает дату на N месяцев, сохраняя число месяца — если в целевом месяце
 * столько дней нет (например, 31 в апреле), берётся последний день месяца.
 * Используется для помесячного rollover ежемесячных событий.
 */
export function shiftMonthClamped(d: DatePart, months: number): DatePart {
  const desiredDay = d.day;
  const base = new Date(Date.UTC(d.year, d.month + months, 1));
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  return { year, month, day: Math.min(desiredDay, daysInMonth(year, month)) };
}

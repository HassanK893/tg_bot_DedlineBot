import type { DatePart } from "../../types/event.js";

/**
 * Русские подписи дат — единственный источник для календарей, сводки события
 * и текстов подтверждений. Раньше жили в keyboards/calendar.ts, но нужны и
 * там, где никакой клавиатуры нет (helpers/summarize-draft.ts).
 */

export const MONTHS = [
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

/** 0=Пн..6=Вс — тот же порядок, что в IntervalSchedule.weekday. Единственный источник подписей. */
export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

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

export function monthTitle(year: number, month: number): string {
  return `${MONTHS[month] ?? "?"} ${year}`;
}

export function formatDate(d: DatePart): string {
  return `${d.day} ${MONTHS_GENITIVE[d.month] ?? "?"} ${d.year}`;
}

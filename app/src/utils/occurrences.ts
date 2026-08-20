import { DateTime } from "luxon";
import type { CustomDateEntry, DatePart, IntervalSchedule } from "../types/event.js";

/**
 * «Правило-движок»: превращает декларативную настройку напоминаний события
 * (свои даты — список date+times, либо интервал — unit/every/time/weekday/
 * dayOfMonth) в конкретный список моментов отправки в UTC. Ничего не знает
 * про БД/очередь — чистые функции даты/времени, часовой пояс пользователя
 * учитывается через luxon (корректно обрабатывает переходы на летнее/зимнее
 * время внутри IANA-зоны).
 */

function parseHM(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":");
  return { hour: Number(h ?? 0), minute: Number(m ?? 0) };
}

function localDateTime(d: DatePart, time: string, zone: string): DateTime {
  const { hour, minute } = parseHM(time);
  return DateTime.fromObject(
    { year: d.year, month: d.month + 1, day: d.day, hour, minute, second: 0, millisecond: 0 },
    { zone },
  );
}

/** Полночь по местному времени пользователя. */
function localMidnight(d: DatePart, zone: string): DateTime {
  return localDateTime(d, "00:00", zone);
}

/** Конец дня (23:59:59.999) по местному времени пользователя. */
function localEndOfDay(d: DatePart, zone: string): DateTime {
  return localMidnight(d, zone).plus({ days: 1 }).minus({ milliseconds: 1 });
}

export interface EventScheduleInput {
  startDate: DatePart;
  endDate: DatePart;
  scheduleType: "custom" | "interval";
  customDates?: CustomDateEntry[];
  intervalSchedule?: IntervalSchedule;
  timezone: string;
}

/** Список моментов отправки (UTC), отсортированный по возрастанию, без дублей. */
export function computeOccurrences(input: EventScheduleInput): Date[] {
  const occurrences =
    input.scheduleType === "custom"
      ? computeCustomOccurrences(input.customDates ?? [], input.timezone)
      : computeIntervalOccurrences(
          input.startDate,
          input.endDate,
          input.intervalSchedule,
          input.timezone,
        );

  const uniqueMs = [...new Set(occurrences.map((d) => d.getTime()))].sort((a, b) => a - b);
  return uniqueMs.map((ms) => new Date(ms));
}

function computeCustomOccurrences(entries: CustomDateEntry[], zone: string): Date[] {
  const result: Date[] = [];
  for (const entry of entries) {
    for (const time of entry.times) {
      result.push(localDateTime(entry.date, time, zone).toJSDate());
    }
  }
  return result;
}

/**
 * Часы: без явного времени суток — первое срабатывание через `every` часов
 * после полуночи startDate (не мгновенно в момент создания), дальше с тем же
 * шагом до конца дня endDate включительно.
 */
function computeHourlyOccurrences(startDate: DatePart, endDate: DatePart, every: number, zone: string): Date[] {
  const end = localEndOfDay(endDate, zone);
  const result: Date[] = [];
  let t = localMidnight(startDate, zone).plus({ hours: every });
  while (t <= end) {
    result.push(t.toJSDate());
    t = t.plus({ hours: every });
  }
  return result;
}

/** Дни: первое срабатывание — сам startDate в `time`, дальше каждые `every` дней до endDate включительно. */
function computeDailyOccurrences(
  startDate: DatePart,
  endDate: DatePart,
  every: number,
  time: string,
  zone: string,
): Date[] {
  const end = localEndOfDay(endDate, zone);
  const result: Date[] = [];
  let t = localDateTime(startDate, time, zone);
  while (t <= end) {
    result.push(t.toJSDate());
    t = t.plus({ days: every });
  }
  return result;
}

/**
 * Недели: первое срабатывание — ближайший от startDate (включительно) день
 * с нужным днём недели (0=Пн..6=Вс), в `time`, дальше каждые `every` недель.
 */
function computeWeeklyOccurrences(
  startDate: DatePart,
  endDate: DatePart,
  every: number,
  weekday: number,
  time: string,
  zone: string,
): Date[] {
  const end = localEndOfDay(endDate, zone);
  // luxon: weekday 1=Пн..7=Вс — переводим из нашего 0=Пн..6=Вс.
  const targetLuxonWeekday = weekday + 1;

  let anchor = localDateTime(startDate, time, zone);
  const diff = (targetLuxonWeekday - anchor.weekday + 7) % 7;
  anchor = anchor.plus({ days: diff });

  const result: Date[] = [];
  let t = anchor;
  while (t <= end) {
    result.push(t.toJSDate());
    t = t.plus({ weeks: every });
  }
  return result;
}

/**
 * Месяцы: первое срабатывание — ближайшее число `dayOfMonth` (включительно)
 * от startDate, в `time`; если в месяце меньше дней — берётся последний день
 * месяца. Дальше каждые `every` месяцев.
 */
function computeMonthlyOccurrences(
  startDate: DatePart,
  endDate: DatePart,
  every: number,
  dayOfMonth: number,
  time: string,
  zone: string,
): Date[] {
  const end = localEndOfDay(endDate, zone);
  const { hour, minute } = parseHM(time);

  const clampedInMonth = (base: DateTime): DateTime =>
    base.set({ day: Math.min(dayOfMonth, base.daysInMonth ?? dayOfMonth), hour, minute, second: 0, millisecond: 0 });

  let candidate = clampedInMonth(localMidnight(startDate, zone));
  if (candidate < localMidnight(startDate, zone)) {
    candidate = clampedInMonth(localMidnight(startDate, zone).plus({ months: 1 }));
  }

  const result: Date[] = [];
  let t = candidate;
  while (t <= end) {
    result.push(t.toJSDate());
    t = clampedInMonth(t.plus({ months: every }));
  }
  return result;
}

function computeIntervalOccurrences(
  startDate: DatePart,
  endDate: DatePart,
  schedule: IntervalSchedule | undefined,
  zone: string,
): Date[] {
  if (!schedule) return [];

  if (schedule.unit === "hours") {
    return computeHourlyOccurrences(startDate, endDate, schedule.every, zone);
  }
  if (schedule.unit === "days") {
    if (!schedule.time) return [];
    return computeDailyOccurrences(startDate, endDate, schedule.every, schedule.time, zone);
  }
  if (schedule.unit === "weeks") {
    if (!schedule.time || schedule.weekday === undefined) return [];
    return computeWeeklyOccurrences(startDate, endDate, schedule.every, schedule.weekday, schedule.time, zone);
  }
  // schedule.unit === "months"
  if (!schedule.time || schedule.dayOfMonth === undefined) return [];
  return computeMonthlyOccurrences(startDate, endDate, schedule.every, schedule.dayOfMonth, schedule.time, zone);
}

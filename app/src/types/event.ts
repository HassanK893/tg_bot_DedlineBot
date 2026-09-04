/**
 * Доменные типы события — общие между визардом бота (создание/редактирование)
 * и бэкенд-модулями (персист, вычисление напоминаний). Единственный источник
 * истины для формы EventDraft, см. CHECKPOINT.md для истории.
 */

export type EventKind = "once" | "monthly";
export type ScheduleType = "custom" | "interval";

/** month — 0-индексный (JS Date convention), как везде в calendar.ts/features/create-event.ts. */
export interface DatePart {
  year: number;
  month: number;
  day: number;
}

export interface CustomDateEntry {
  date: DatePart;
  /** "ЧЧ:ММ", несколько на одну дату. */
  times: string[];
}

export type IntervalUnit = "hours" | "days" | "weeks" | "months";

export interface IntervalSchedule {
  unit: IntervalUnit;
  /** «Раз в N [unit]»: часы 1–24, дни 1–7, недели 1–4, месяцы 1–12. */
  every: number;
  /** Время суток — для всех единиц, кроме часов. */
  time?: string;
  /** День недели (0=Пн..6=Вс) — только для unit="weeks". */
  weekday?: number;
  /** Число месяца (1–31) — только для unit="months". */
  dayOfMonth?: number;
}

export interface EventDraft {
  name?: string;
  description?: string;
  reminderText?: string;
  photoFileId?: string;
  kind?: EventKind;
  startDate?: DatePart;
  scheduleType?: ScheduleType;
  endDate?: DatePart;
  customDates?: CustomDateEntry[];
  intervalSchedule?: IntervalSchedule;
}

/** EventDraft после шага 8 — все обязательные поля заполнены, готово к персисту. */
export interface CompleteEventDraft {
  name: string;
  description: string;
  reminderText: string;
  photoFileId?: string;
  kind: EventKind;
  startDate: DatePart;
  endDate: DatePart;
  scheduleType: ScheduleType;
  customDates?: CustomDateEntry[];
  intervalSchedule?: IntervalSchedule;
}

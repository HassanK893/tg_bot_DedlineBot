import type { DatePart, EventKind, IntervalSchedule, IntervalUnit } from "../../../types/event.js";
import { dateSortKey } from "../../../utils/datePart.js";
import { INT_NUM_PATTERN, SCHEDULE, WEEKDAY_PICK_PATTERN, intervalUnitData } from "../../callback-data/wizard.js";
import { isCancel } from "../../filters/is-cancel.js";
import { buildNumberPicker, buildWeekdayPicker } from "../../keyboards/number-picker.js";
import { intervalUnitKeyboard } from "../../keyboards/wizard.js";
import { skipUnexpected } from "../screen.js";
import { pickSingleTime } from "./time.js";
import { waitNumericPick } from "./wait-input.js";
import { renderStep, type WizardScreen } from "./wizard-screen.js";

/** Черновик глазами этого режима — только поля, которые он читает или пишет. */
export interface IntervalDraft {
  startDate?: DatePart;
  endDate?: DatePart;
  kind?: EventKind;
  intervalSchedule?: IntervalSchedule;
}

/**
 * Какие единицы интервала вообще имеют смысл при выбранном промежутке
 * событие←→конец. Один день в промежутке — только часы, два и больше — и
 * дни, неделя и больше — и недели, месяц и больше — и месяцы. «Месяцы»
 * никогда не предлагаются для ежемесячного типа события — там и так есть
 * свой помесячный повтор.
 */
export function availableIntervalUnits(
  startDate: DatePart,
  endDate: DatePart,
  kind: EventKind | undefined,
): IntervalUnit[] {
  const spanDays = Math.round((dateSortKey(endDate) - dateSortKey(startDate)) / 86_400_000) + 1;
  const units: IntervalUnit[] = ["hours"];
  if (spanDays >= 2) units.push("days");
  if (spanDays >= 7) units.push("weeks");
  if (spanDays >= 31 && kind !== "monthly") units.push("months");
  return units;
}

type UnitPickResult = { kind: "unit"; unit: IntervalUnit } | "switch" | "cancel";

/** Тап по единице интервала — принимаются только те, что есть в units. */
async function waitIntervalUnitPick(screen: WizardScreen, units: IntervalUnit[]): Promise<UnitPickResult> {
  while (true) {
    const next = await screen.conversation.wait();
    const data = next.callbackQuery?.data;

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === SCHEDULE.back) {
      await next.answerCallbackQuery();
      return "switch";
    }
    const unit = units.find((u) => data === intervalUnitData(u));
    if (unit) {
      await next.answerCallbackQuery();
      return { kind: "unit", unit };
    }
    await skipUnexpected(next);
  }
}

/** «Раз во сколько …?» / «Какого числа …?» — сетка чисел min..max. */
async function askNumber(screen: WizardScreen, question: string, min: number, max: number): Promise<number | "cancel"> {
  await renderStep(screen, question, buildNumberPicker(min, max));
  return waitNumericPick(screen.conversation, INT_NUM_PATTERN);
}

async function askWeekday(screen: WizardScreen): Promise<number | "cancel"> {
  await renderStep(screen, "В какой день недели присылать напоминание?", buildWeekdayPicker());
  return waitNumericPick(screen.conversation, WEEKDAY_PICK_PATTERN);
}

const TIME_QUESTION = "В какое время присылать напоминание?";

export type IntervalResult = "cancel" | "switch" | "done";

/**
 * Режим «Интервал»: сначала выбор единицы (часы/дни/недели/месяцы —
 * доступность зависит от длины промежутка начало→конец, см.
 * availableIntervalUnits), затем число («раз в N [unit]»); для дней/недель/
 * месяцев ещё и время суток, для недель — ещё и день недели, для месяцев —
 * ещё и число месяца.
 */
export async function runIntervalFlow(screen: WizardScreen, draft: IntervalDraft): Promise<IntervalResult> {
  if (!draft.startDate || !draft.endDate) return "cancel"; // не должно происходить

  const units = availableIntervalUnits(draft.startDate, draft.endDate, draft.kind);

  await renderStep(screen, "Выберите, как часто присылать напоминание.", intervalUnitKeyboard(units));

  const unitRes = await waitIntervalUnitPick(screen, units);
  if (unitRes === "cancel" || unitRes === "switch") return unitRes;

  if (unitRes.unit === "hours") {
    const n = await askNumber(screen, "Раз во сколько часов присылать напоминание?", 1, 24);
    if (n === "cancel") return "cancel";
    draft.intervalSchedule = { unit: "hours", every: n };
    return "done";
  }

  if (unitRes.unit === "days") {
    const days = await askNumber(screen, "Раз во сколько дней присылать напоминание?", 1, 7);
    if (days === "cancel") return "cancel";

    const timeRes = await pickSingleTime(screen, TIME_QUESTION);
    if (timeRes === "cancel") return "cancel";

    draft.intervalSchedule = { unit: "days", every: days, time: timeRes };
    return "done";
  }

  if (unitRes.unit === "weeks") {
    const weeks = await askNumber(screen, "Раз во сколько недель присылать напоминание?", 1, 4);
    if (weeks === "cancel") return "cancel";

    const weekday = await askWeekday(screen);
    if (weekday === "cancel") return "cancel";

    const timeRes = await pickSingleTime(screen, TIME_QUESTION);
    if (timeRes === "cancel") return "cancel";

    draft.intervalSchedule = { unit: "weeks", every: weeks, weekday, time: timeRes };
    return "done";
  }

  // unitRes.unit === "months"
  const months = await askNumber(screen, "Раз во сколько месяцев присылать напоминание?", 1, 12);
  if (months === "cancel") return "cancel";

  const dayOfMonth = await askNumber(screen, "Какого числа месяца присылать напоминание?", 1, 31);
  if (dayOfMonth === "cancel") return "cancel";

  const timeRes = await pickSingleTime(screen, TIME_QUESTION);
  if (timeRes === "cancel") return "cancel";

  draft.intervalSchedule = { unit: "months", every: months, dayOfMonth, time: timeRes };
  return "done";
}

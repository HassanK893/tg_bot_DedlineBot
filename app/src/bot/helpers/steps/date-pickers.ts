import type { DatePart } from "../../../types/event.js";
import { CAL_NOOP, YM_NOOP, parseCalDay, parseCalNav, parseYmNav, parseYmPick } from "../../callback-data/wizard.js";
import { isCancel } from "../../filters/is-cancel.js";
import { buildCalendar, buildFixedMonthCalendar, type CalendarRange } from "../../keyboards/calendar.js";
import { buildYearMonthPicker } from "../../keyboards/year-month.js";
import { answerStaleCallback, tryDelete } from "../screen.js";
import { renderStep, todayInConversation, type WizardScreen } from "./wizard-screen.js";

/**
 * Шаги выбора одной даты. Три варианта под три клавиатуры из keyboards/:
 * свободный календарь, выбор месяца, день внутри зафиксированного месяца.
 * Каждый крутится, пока не получит дату (или отмену), обслуживая по пути
 * навигацию и неактивные клетки.
 */

/** Свободный календарь с листанием месяцев; range сужает кликабельные дни. */
export async function pickCalendarDate(
  screen: WizardScreen,
  question: string,
  range?: CalendarRange,
): Promise<DatePart | "cancel"> {
  const today = await todayInConversation(screen.conversation);
  // если есть нижняя граница — сразу открываем её месяц, а не текущий
  let year = range?.min?.year ?? today.year;
  let month = range?.min?.month ?? today.month;

  await renderStep(screen, question, buildCalendar(year, month, range, today));

  while (true) {
    const next = await screen.conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === CAL_NOOP) {
      await next.answerCallbackQuery();
      continue;
    }

    const nav = parseCalNav(data);
    if (nav) {
      year = nav.year;
      month = nav.month;
      await renderStep(screen, question, buildCalendar(year, month, range, today));
      await next.answerCallbackQuery();
      continue;
    }

    const day = parseCalDay(data);
    if (day) {
      await next.answerCallbackQuery();
      return day;
    }

    await answerStaleCallback(next);
  }
}

/** Выбор месяца (год листается стрелками) — первый шаг дат ежемесячного события. */
export async function pickYearMonth(
  screen: WizardScreen,
  question: string,
): Promise<{ year: number; month: number } | "cancel"> {
  const today = await todayInConversation(screen.conversation);
  let year = today.year;

  await renderStep(screen, question, buildYearMonthPicker(year, today));

  while (true) {
    const next = await screen.conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === YM_NOOP) {
      await next.answerCallbackQuery();
      continue;
    }

    const nav = parseYmNav(data);
    if (nav !== null) {
      year = nav;
      await renderStep(screen, question, buildYearMonthPicker(year, today));
      await next.answerCallbackQuery();
      continue;
    }

    const pick = parseYmPick(data);
    if (pick) {
      await next.answerCallbackQuery();
      return pick;
    }

    await answerStaleCallback(next);
  }
}

/**
 * Выбор дня в уже зафиксированном месяце (без переключения месяцев) —
 * используется для даты начала/конца ежемесячного события.
 */
export async function pickFixedMonthDate(
  screen: WizardScreen,
  year: number,
  month: number,
  question: string,
  range?: CalendarRange,
): Promise<DatePart | "cancel"> {
  await renderStep(screen, question, buildFixedMonthCalendar(year, month, range));

  while (true) {
    const next = await screen.conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === CAL_NOOP) {
      await next.answerCallbackQuery();
      continue;
    }

    const day = parseCalDay(data);
    if (day) {
      await next.answerCallbackQuery();
      return day;
    }

    await answerStaleCallback(next);
  }
}

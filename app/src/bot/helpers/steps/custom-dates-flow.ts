import type { CustomDateEntry, DatePart } from "../../../types/event.js";
import { CAL_NOOP, CUSTOM_DONE, SCHEDULE, parseCalDay, parseCalNav } from "../../callback-data/wizard.js";
import { isCancel } from "../../filters/is-cancel.js";
import { buildCustomDatePicker, type CalendarRange } from "../../keyboards/calendar.js";
import { formatDate } from "../date-format.js";
import { skipUnexpected } from "../screen.js";
import { collectTimesForDate } from "./time.js";
import { renderStep, type WizardScreen } from "./wizard-screen.js";

/** Черновик глазами этого режима — только поля, которые он читает или пишет. */
export interface CustomDatesDraft {
  customDates?: CustomDateEntry[];
  startDate?: DatePart;
  endDate?: DatePart;
}

type CustomDatePick = { kind: "day"; date: DatePart } | { kind: "nav"; year: number; month: number };

/** Один тап по календарю «своих дат»: день, листание месяца, «Готово» или смена режима. */
async function waitCustomDatePick(screen: WizardScreen): Promise<CustomDatePick | "done" | "switch" | "cancel"> {
  while (true) {
    const next = await screen.conversation.wait();
    const data = next.callbackQuery?.data;

    if (isCancel(data)) {
      await next.answerCallbackQuery();
      return "cancel";
    }
    if (data === CUSTOM_DONE) {
      await next.answerCallbackQuery();
      return "done";
    }
    if (data === SCHEDULE.back) {
      await next.answerCallbackQuery();
      return "switch";
    }
    if (data === CAL_NOOP) {
      await next.answerCallbackQuery();
      continue;
    }
    if (data) {
      const nav = parseCalNav(data);
      if (nav) {
        await next.answerCallbackQuery();
        return { kind: "nav", ...nav };
      }
      const date = parseCalDay(data);
      if (date) {
        await next.answerCallbackQuery();
        return { kind: "day", date };
      }
    }
    await skipUnexpected(next);
  }
}

function customDatesQuestion(entries: CustomDateEntry[]): string {
  return entries.length > 0
    ? "Выберите ещё одну дату — или нажмите «Готово»."
    : "Выберите дату для отдельного напоминания.";
}

export type CustomDatesResult = "cancel" | "switch" | "done";

/**
 * Режим «Свои даты»: пока пользователь не нажмёт «Готово», по кругу —
 * выбор даты в календаре (уже выбранные помечены галочкой), затем выбор
 * времени для неё, снова календарь. Список дат+времени копится в
 * draft.customDates и сразу виден в живой форме через fieldsSummary.
 */
export async function runCustomDatesFlow(
  screen: WizardScreen,
  draft: CustomDatesDraft,
  fixedMonth: { year: number; month: number } | undefined,
): Promise<CustomDatesResult> {
  const entries = draft.customDates ?? [];
  draft.customDates = entries;

  // диапазон нужен в обоих режимах: для ежемесячного start/end лежат в одном
  // и том же зафиксированном месяце (сузит его до дней 20–30 и т.п.), для
  // разового может охватывать несколько месяцев — тогда промежуточные месяцы
  // окажутся полностью внутри диапазона и покажутся целиком, это нормально.
  const range: CalendarRange | undefined =
    draft.startDate && draft.endDate ? { min: draft.startDate, max: draft.endDate } : undefined;

  let year = fixedMonth?.year ?? draft.startDate?.year;
  let month = fixedMonth?.month ?? draft.startDate?.month;
  if (year === undefined || month === undefined) return "cancel"; // не должно происходить

  while (true) {
    await renderStep(
      screen,
      customDatesQuestion(entries),
      buildCustomDatePicker(year, month, {
        fixed: Boolean(fixedMonth),
        ...(range ? { range } : {}),
        marked: entries.map((e) => e.date),
        canFinish: entries.length > 0,
      }),
    );

    const picked = await waitCustomDatePick(screen);
    if (picked === "cancel" || picked === "switch" || picked === "done") return picked;

    if (picked.kind === "nav") {
      year = picked.year;
      month = picked.month;
      continue;
    }

    const timesRes = await collectTimesForDate(screen, formatDate(picked.date));
    if (timesRes === "cancel") return "cancel";

    entries.push({ date: picked.date, times: timesRes });
  }
}

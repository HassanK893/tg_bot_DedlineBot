import type { CustomDateEntry, DatePart, EventKind, IntervalSchedule, ScheduleType } from "../../../types/event.js";
import { SCHEDULE } from "../../callback-data/wizard.js";
import type { CalendarRange } from "../../keyboards/calendar.js";
import { scheduleChoiceKeyboard } from "../../keyboards/wizard.js";
import { monthTitle } from "../date-format.js";
import { runCustomDatesFlow } from "./custom-dates-flow.js";
import { pickCalendarDate, pickFixedMonthDate, pickYearMonth } from "./date-pickers.js";
import { runIntervalFlow } from "./interval-flow.js";
import { waitChoice } from "./wait-input.js";
import { renderStep, todayInConversation, type WizardScreen } from "./wizard-screen.js";

export interface DateAndScheduleDraft {
  kind?: EventKind;
  startDate?: DatePart;
  endDate?: DatePart;
  scheduleType?: ScheduleType;
  customDates?: CustomDateEntry[];
  intervalSchedule?: IntervalSchedule;
}

/** Подписи шагов: при создании — «Шаг 6 из 8.» и т.п., при редактировании — пустые. */
export interface StepLabels {
  start: string;
  end: string;
  schedule: string;
}

type FixedMonth = { year: number; month: number };

/**
 * Дата начала. Ежемесячное: сначала фиксируем месяц отдельным шагом, потом
 * день внутри него (не раньше сегодня). Разовое: свободный календарь.
 * Возвращает и месяц — он понадобится для даты конца и режима «Свои даты».
 */
async function pickStartDate(
  screen: WizardScreen,
  draft: DateAndScheduleDraft,
  stepLabel: StepLabels,
): Promise<{ fixedMonth: FixedMonth | undefined } | "cancel"> {
  if (draft.kind === "monthly") {
    const ymRes = await pickYearMonth(screen, `${stepLabel.start} Выберите месяц, с которого начнутся напоминания.`);
    if (ymRes === "cancel") return "cancel";
    const fixedMonth = ymRes;

    const today = await todayInConversation(screen.conversation);

    const startRes = await pickFixedMonthDate(
      screen,
      fixedMonth.year,
      fixedMonth.month,
      `${stepLabel.start} ${monthTitle(fixedMonth.year, fixedMonth.month)}. Выберите дату начала.`,
      { min: today },
    );
    if (startRes === "cancel") return "cancel";
    draft.startDate = startRes;
    return { fixedMonth };
  }

  const dateRes = await pickCalendarDate(screen, `${stepLabel.start} Выберите дату начала события.`);
  if (dateRes === "cancel") return "cancel";
  draft.startDate = dateRes;
  return { fixedMonth: undefined };
}

/** Дата окончания — не раньше начала; для ежемесячного — в том же зафиксированном месяце. */
async function pickEndDate(
  screen: WizardScreen,
  draft: DateAndScheduleDraft,
  stepLabel: StepLabels,
  fixedMonth: FixedMonth | undefined,
): Promise<DatePart | "cancel"> {
  if (draft.kind === "monthly" && fixedMonth && draft.startDate) {
    return pickFixedMonthDate(
      screen,
      fixedMonth.year,
      fixedMonth.month,
      `${stepLabel.end} ${monthTitle(fixedMonth.year, fixedMonth.month)}. Выберите дату окончания.`,
      { min: draft.startDate },
    );
  }

  const endRange: CalendarRange | undefined = draft.startDate ? { min: draft.startDate } : undefined;
  return pickCalendarDate(screen, `${stepLabel.end} Выберите дату окончания события.`, endRange);
}

/** Экран выбора режима — показывается и в начале, и после «↩ Сменить режим». */
async function showScheduleChoice(screen: WizardScreen, stepLabel: StepLabels) {
  await renderStep(screen, `${stepLabel.schedule} Выберите, как задать напоминания.`, scheduleChoiceKeyboard());
}

export type DateAndScheduleResult = "cancel" | "done";

/**
 * Даты начала/конца (в зависимости от kind) + выбор режима напоминаний —
 * идентичная последовательность и при создании события (шаги 6-8 в
 * features/create-event.ts), и при редактировании «Даты и напоминания» одним блоком
 * (features/edit-event/). stepLabel — только текст подписи шага, сама логика общая.
 */
export async function runDateAndScheduleFlow(
  screen: WizardScreen,
  draft: DateAndScheduleDraft,
  stepLabel: StepLabels,
): Promise<DateAndScheduleResult> {
  const startRes = await pickStartDate(screen, draft, stepLabel);
  if (startRes === "cancel") return "cancel";
  const { fixedMonth } = startRes;

  const endRes = await pickEndDate(screen, draft, stepLabel, fixedMonth);
  if (endRes === "cancel") return "cancel";
  draft.endDate = endRes;

  await showScheduleChoice(screen, stepLabel);

  while (true) {
    const choiceRes = await waitChoice(screen.conversation, [SCHEDULE.custom, SCHEDULE.interval]);
    if (choiceRes.kind === "cancel") return "cancel";
    draft.scheduleType = choiceRes.value === SCHEDULE.custom ? "custom" : "interval";

    if (draft.scheduleType === "custom") {
      const customRes = await runCustomDatesFlow(screen, draft, fixedMonth);
      if (customRes === "cancel") return "cancel";
      if (customRes === "switch") {
        delete draft.scheduleType;
        delete draft.customDates;
        await showScheduleChoice(screen, stepLabel);
        continue;
      }
      return "done";
    }

    const intervalRes = await runIntervalFlow(screen, draft);
    if (intervalRes === "cancel") return "cancel";
    if (intervalRes === "switch") {
      delete draft.scheduleType;
      delete draft.intervalSchedule;
      await showScheduleChoice(screen, stepLabel);
      continue;
    }
    return "done";
  }
}

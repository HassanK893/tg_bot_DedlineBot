import { SCHEDULE } from "../../callback-data/wizard.js";
import { runCustomDatesFlow, runIntervalFlow, waitChoice } from "../../helpers/steps/index.js";
import { scheduleChoiceKeyboard } from "../../keyboards/wizard.js";
import type { EditSession } from "./session.js";
import { runCustomDatesManageMenu } from "./custom-dates.js";

/**
 * Правка напоминаний. Другой режим — полный сброс и настройка заново тем же
 * шагом, что при создании. Тот же режим: для «своих дат» — меню
 * добавить/удалить (custom-dates.ts), для интервала — переоткрыть настройку целиком.
 */
export async function editSchedule(session: EditSession): Promise<void> {
  const { draft } = session;
  const previousType = draft.scheduleType;
  const fixedMonth =
    draft.kind === "monthly" && draft.startDate ? { year: draft.startDate.year, month: draft.startDate.month } : undefined;

  await session.render("Выберите режим напоминаний.", scheduleChoiceKeyboard());
  const choice = await waitChoice(session.conversation, [SCHEDULE.custom, SCHEDULE.interval]);
  if (choice.kind === "cancel") return;
  const newType = choice.value === SCHEDULE.custom ? "custom" : "interval";

  if (newType !== previousType) {
    delete draft.customDates;
    delete draft.intervalSchedule;
    draft.scheduleType = newType;
    if (newType === "custom") {
      const res = await runCustomDatesFlow(session, draft, fixedMonth);
      if (res !== "cancel") await session.persist();
    } else {
      const res = await runIntervalFlow(session, draft);
      if (res !== "cancel") await session.persist();
    }
    return;
  }

  // тот же режим, что и был
  if (newType === "custom") {
    await runCustomDatesManageMenu(session, fixedMonth);
  } else {
    delete draft.intervalSchedule;
    const res = await runIntervalFlow(session, draft);
    if (res !== "cancel") await session.persist();
  }
}

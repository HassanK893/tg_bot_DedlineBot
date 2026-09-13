import { runDateAndScheduleFlow } from "../../helpers/steps/index.js";
import { confirmKeyboard } from "../../keyboards/edit-event.js";
import type { EventKind } from "../../../types/event.js";
import type { EditSession } from "./session.js";

/**
 * Смена типа события (разовое ↔ ежемесячное). Даты и напоминания при этом
 * теряют смысл (у ежемесячного окно живёт внутри одного месяца, у разового —
 * произвольное), поэтому стираются и задаются заново тем же блоком шагов, что
 * при создании. Это осознанное решение пользователя — спрашиваем явно.
 */
export async function editKind(session: EditSession): Promise<void> {
  const { draft } = session;
  const otherKind: EventKind = draft.kind === "once" ? "monthly" : "once";
  const otherLabel = otherKind === "once" ? "разовое" : "ежемесячное";

  await session.render(
    `Сменить тип события на «${otherLabel}»? Все даты и настройка напоминаний будут стёрты — их нужно будет задать заново.`,
    confirmKeyboard("✅ Да, сменить", "Отмена"),
  );

  if (await session.waitYesNo()) {
    draft.kind = otherKind;
    delete draft.startDate;
    delete draft.endDate;
    delete draft.scheduleType;
    delete draft.customDates;
    delete draft.intervalSchedule;

    const res = await runDateAndScheduleFlow(session, draft, {
      start: "",
      end: "",
      schedule: "",
    });
    if (res === "done") await session.persist();
  }
}

import { formatDate } from "../../helpers/date-format.js";
import { pickCalendarDate, pickFixedMonthDate } from "../../helpers/steps/index.js";
import type { CalendarRange } from "../../keyboards/calendar.js";
import { confirmKeyboard } from "../../keyboards/edit-event.js";
import type { DatePart } from "../../../types/event.js";
import { dateSortKey } from "../../../utils/datePart.js";
import type { EditSession } from "./session.js";

const RANGE_WARNING =
  "Если ранее заданные даты/время напоминаний окажутся вне нового диапазона, они больше не будут отправляться.";

function boundaryLabel(isStart: boolean): string {
  return isStart ? "дату начала" : "дату окончания";
}

/**
 * Выбор новой границы тем же пикером, что и при создании: для ежемесячного —
 * день внутри зафиксированного месяца (месяц берём у текущей даты начала),
 * для разового — свободный календарь. Другая граница ограничивает диапазон.
 */
async function pickBoundary(session: EditSession, isStart: boolean): Promise<DatePart | "cancel"> {
  const { draft } = session;
  if (!draft.kind || !draft.startDate || !draft.endDate) return "cancel"; // не должно происходить
  const range: CalendarRange = isStart ? { max: draft.endDate } : { min: draft.startDate };
  const question = `${RANGE_WARNING} Выберите ${boundaryLabel(isStart)}.`;

  if (draft.kind === "monthly") {
    return pickFixedMonthDate(session, draft.startDate.year, draft.startDate.month, question, range);
  }
  return pickCalendarDate(session, question, range);
}

/**
 * «Свои даты», выпавшие из нового диапазона, убираем сразу — иначе они так и
 * висели бы в сводке, хотя напоминания по ним уже не отправляются.
 */
function dropCustomDatesOutsideRange(session: EditSession): void {
  const { draft } = session;
  if (draft.scheduleType === "custom" && draft.customDates && draft.startDate && draft.endDate) {
    const start = draft.startDate;
    const end = draft.endDate;
    draft.customDates = draft.customDates.filter(
      (e) => dateSortKey(e.date) >= dateSortKey(start) && dateSortKey(e.date) <= dateSortKey(end),
    );
  }
}

/** Правка даты начала или окончания: выбрать → подтвердить с предупреждением → пересчитать напоминания. */
export async function editBoundaryDate(session: EditSession, which: "start" | "end"): Promise<void> {
  const { draft } = session;
  if (!draft.kind || !draft.startDate || !draft.endDate) return; // не должно происходить
  const isStart = which === "start";

  const picked = await pickBoundary(session, isStart);
  if (picked === "cancel") return;

  await session.render(
    `Изменить ${boundaryLabel(isStart)} на ${formatDate(picked)}? ${RANGE_WARNING}`,
    confirmKeyboard("✅ Да, изменить", "Отмена"),
  );
  if (!(await session.waitYesNo())) return;

  if (isStart) draft.startDate = picked;
  else draft.endDate = picked;

  dropCustomDatesOutsideRange(session);

  await session.persist();
}

import { formatDate, WEEKDAYS } from "../keyboards/calendar.js";
import { dateSortKey } from "../../utils/datePart.js";
import { escapeHtml } from "../../utils/html.js";
import type { EventDraft } from "../../types/event.js";

/**
 * Единый рендер полей события в виде маркированного списка с иконками —
 * используется живой формой визарда, экраном «Мои события» и редактированием,
 * поэтому принимает EventDraft (общая форма, см. types/event.ts), а не
 * что-то специфичное для одного экрана.
 *
 * Чистая функция: ни ctx, ни conversation, ни обращений в БД. Поэтому и вынесена
 * отдельно от шагов визарда — её можно звать откуда угодно, включая плоские
 * хендлеры в features/events-menu.ts.
 */
export function summarizeDraft(draft: EventDraft): string {
  const kindLabel = draft.kind === "once" ? "разовое" : draft.kind === "monthly" ? "ежемесячное" : "—";
  const startLabel = draft.startDate ? formatDate(draft.startDate) : "—";
  const endLabel = draft.endDate ? formatDate(draft.endDate) : "—";
  const photoLabel = draft.photoFileId ? "добавлена ✅" : "—";

  let scheduleLine: string;
  if (draft.scheduleType === "custom") {
    if (draft.customDates && draft.customDates.length > 0) {
      const sorted = [...draft.customDates].sort((a, b) => dateSortKey(a.date) - dateSortKey(b.date));
      const rows = sorted
        .map((e) => `    • <b>${formatDate(e.date)}</b>: ${[...e.times].sort().join(", ")}`)
        .join("\n");
      scheduleLine = `свои даты\n${rows}`;
    } else {
      scheduleLine = "свои даты — пока не выбраны";
    }
  } else if (draft.scheduleType === "interval") {
    const s = draft.intervalSchedule;
    if (s === undefined) {
      scheduleLine = "интервал — пока не настроено";
    } else if (s.unit === "hours") {
      scheduleLine = `раз в ${s.every} ч.`;
    } else if (s.unit === "days") {
      scheduleLine = `раз в ${s.every} дн. в ${s.time}`;
    } else if (s.unit === "weeks") {
      scheduleLine = `раз в ${s.every} нед., по ${WEEKDAYS[s.weekday ?? 0]}, в ${s.time}`;
    } else {
      scheduleLine = `раз в ${s.every} мес., ${s.dayOfMonth} числа, в ${s.time}`;
    }
  } else {
    scheduleLine = "—";
  }

  return [
    `📌 <b>Название:</b> ${draft.name ? escapeHtml(draft.name) : "—"}`,
    `📝 <b>Описание:</b> ${draft.description ? escapeHtml(draft.description) : "—"}`,
    `🔔 <b>Текст напоминаний:</b> ${draft.reminderText ? escapeHtml(draft.reminderText) : "—"}`,
    `🖼 <b>Картинка:</b> ${photoLabel}`,
    `🔁 <b>Тип:</b> ${kindLabel}`,
    `▶️ <b>Дата начала:</b> ${startLabel}`,
    `⏹ <b>Дата окончания:</b> ${endLabel}`,
    `⏰ <b>Напоминания:</b> ${scheduleLine}`,
  ].join("\n\n");
}

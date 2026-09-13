import type { Event } from "../../generated/prisma/client.js";
import type { EventDraft } from "../../types/event.js";
import { summarizeDraft } from "./summarize-draft.js";

/**
 * Тексты экранов «Мои события» — карточка события и вопросы подтверждений.
 * Чистые функции без ctx и БД, как и summarize-draft.ts: хендлеры в
 * features/events-menu.ts только достают данные и отдают их сюда.
 */

/** 🟢 активно / ⏸ на паузе — один значок и в списке, и в карточке. */
export function stateIcon(state: string): string {
  return state === "ACTIVE" ? "🟢" : "⏸";
}

/** Первая строка карточки: значок + словами. */
export function stateLine(event: Pick<Event, "state">): string {
  return `${stateIcon(event.state)} <b>${event.state === "ACTIVE" ? "Активно" : "На паузе"}</b>`;
}

/** Карточка события: статус, пометка Done (если есть), пустая строка, сводка полей. */
export function eventCardText(event: Pick<Event, "state" | "doneThisCycle">, draft: EventDraft): string {
  const lines = [stateLine(event)];
  if (event.doneThisCycle) {
    lines.push("⏳ <i>Приостановлено до следующего месяца</i>");
  }
  lines.push("", summarizeDraft(draft));
  return lines.join("\n");
}

/** Вопрос перед Done — разовое удаляется целиком, ежемесячное лишь пропускает остаток месяца. */
export function doneQuestion(event: Pick<Event, "kind">): string {
  return event.kind === "ONCE"
    ? "Пометить событие выполненным? Оно будет удалено вместе со всеми оставшимися напоминаниями."
    : "Пометить выполненным до конца месяца? Оставшиеся напоминания в этом цикле снимутся, событие само возобновится в следующем месяце — или нажмите «Восстановить» раньше.";
}

export const DELETE_QUESTION = "Удалить это событие вместе со всеми напоминаниями?";

export const EMPTY_LIST_TEXT = "Событий пока нет.\n\nСоздайте первое через «➕ Создать событие».";

export const LIST_TEXT = "📋 <b>Мои события</b>\n\nВыберите событие.";

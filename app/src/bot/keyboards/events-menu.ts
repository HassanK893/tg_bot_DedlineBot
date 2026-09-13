import { InlineKeyboard } from "grammy";
import type { Event } from "../../generated/prisma/client.js";
import { eventData } from "../callback-data/event.js";
import { MENU } from "../callback-data/menu.js";
import { stateIcon } from "../helpers/event-card.js";

/**
 * Клавиатуры экранов «Мои события». Все callback_data действий над событием
 * собираются через eventData — см. callback-data/event.ts.
 */

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Пустой список — только назад в меню. */
export function emptyListKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("← Назад", MENU.main);
}

/** По кнопке на событие: значок состояния + обрезанное название. */
export function eventListKeyboard(events: Pick<Event, "id" | "name" | "state">[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const event of events) {
    kb.text(`${stateIcon(event.state)} Событие: ${truncate(event.name, 35)}`, eventData("view", event.id)).row();
  }
  kb.text("← Назад", MENU.main);
  return kb;
}

/**
 * Действия в карточке. Пауза/Возобновить и Done/Восстановить — взаимоисключающие
 * пары, показывается только актуальная половина.
 */
export function eventDetailKeyboard(event: Pick<Event, "id" | "state" | "doneThisCycle">): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (event.state === "ACTIVE") {
    kb.text("⏸ Пауза", eventData("pause", event.id)).row();
  } else {
    kb.text("▶️ Возобновить", eventData("resume", event.id)).row();
  }
  if (event.doneThisCycle) {
    kb.text("🔄 Восстановить этот месяц", eventData("restore", event.id)).row();
  } else {
    kb.text("✅ Done", eventData("done:confirm", event.id)).row();
  }
  kb.text("✏️ Редактировать", eventData("edit", event.id)).row();
  kb.text("🗑 Удалить", eventData("delete:confirm", event.id)).row();
  kb.text("← К списку", MENU.list);
  return kb;
}

export function confirmDeleteKeyboard(eventId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗑 Да, удалить", eventData("delete:do", eventId))
    .text("Отмена", eventData("view", eventId));
}

export function confirmDoneKeyboard(eventId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Да, готово", eventData("done:do", eventId))
    .text("Отмена", eventData("view", eventId));
}

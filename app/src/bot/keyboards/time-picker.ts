import { InlineKeyboard } from "grammy";
import { MENU } from "../callback-data/menu.js";
import { TIME_MANUAL, TIME_NOOP, TIMES_DONE, timePickData } from "../callback-data/wizard.js";

/** 00:00, 00:30, … 23:30 — 48 слотов с шагом полчаса. */
const TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
});

/**
 * Сетка времени с шагом 30 минут (00:00–23:30) плюс кнопка свободного ввода
 * для времени, которого нет в сетке. На одну дату можно выбрать несколько
 * времён — уже выбранные (marked) показываются галочкой и становятся
 * некликабельными, чтобы не добавить одно и то же дважды.
 * callback_data:
 *   time:pick:<HH:MM> — выбор слота
 *   time:manual — переход к вводу времени текстом
 *   time:noop — неактивная (уже выбранная) клетка
 *   times:done — закончить выбор времени для текущей даты
 */
export function buildTimePicker(marked?: string[], canFinish?: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();

  TIME_SLOTS.forEach((slot, i) => {
    if (marked?.includes(slot)) {
      kb.text(`✓${slot}`, TIME_NOOP);
    } else {
      kb.text(slot, timePickData(slot));
    }
    if (i % 4 === 3) kb.row();
  });

  kb.text("✍️ Ввести своё время", TIME_MANUAL).row();
  if (canFinish) kb.text("✅ Готово", TIMES_DONE).row();
  kb.text("← В меню", MENU.main);
  return kb;
}

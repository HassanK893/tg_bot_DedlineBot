import { InlineKeyboard } from "grammy";
import { MENU } from "../callback-data/menu.js";
import { intNumData, weekdayPickData } from "../callback-data/wizard.js";
import { WEEKDAYS } from "../helpers/date-format.js";

/**
 * Простая сетка чисел min..max — используется для «раз в N часов/дней» в
 * интервальном режиме напоминаний.
 * callback_data: int:num:<n>
 */
export function buildNumberPicker(min: number, max: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  let cell = 0;
  for (let n = min; n <= max; n++) {
    kb.text(String(n), intNumData(n));
    cell++;
    if (cell % 6 === 0) kb.row();
  }
  if (cell % 6 !== 0) kb.row();
  kb.text("← В меню", MENU.main);
  return kb;
}

/**
 * Выбор дня недели — используется в интервальном режиме напоминаний для
 * unit="weeks" («раз в N недель, по такому-то дню»).
 * callback_data: wd:pick:<0..6> — 0=Пн..6=Вс.
 */
export function buildWeekdayPicker(): InlineKeyboard {
  const kb = new InlineKeyboard();
  WEEKDAYS.forEach((name, i) => kb.text(name, weekdayPickData(i)));
  kb.row().text("← В меню", MENU.main);
  return kb;
}

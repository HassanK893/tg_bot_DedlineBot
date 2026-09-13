import { InlineKeyboard } from "grammy";
import { MENU } from "../callback-data/menu.js";
import { YM_NOOP, ymNavData, ymPickData } from "../callback-data/wizard.js";
import { MONTHS } from "../helpers/date-format.js";

/**
 * Выбор месяца: год сверху с навигацией стрелками, под ним сетка из 12
 * месяцев этого года. Используется, когда сначала нужно закрепить месяц, а
 * дни внутри него выбираются отдельным шагом (см. buildFixedMonthCalendar).
 * callback_data:
 *   ym:nav:<year> — переключение года
 *   ym:pick:<year>:<month> — выбор месяца
 *   ym:noop — неактивная клетка
 *
 * today, если передан, запрещает уйти в прошлое: стрелка «‹» становится
 * неактивной, когда левее уже некуда (текущий год), а месяцы раньше
 * текущего в текущем году показываются прочерком вместо названия.
 */
export function buildYearMonthPicker(
  year: number,
  today?: { year: number; month: number },
): InlineKeyboard {
  const kb = new InlineKeyboard();

  const canGoBack = !today || year - 1 >= today.year;
  if (canGoBack) {
    kb.text("‹", ymNavData(year - 1));
  } else {
    kb.text("🚫", YM_NOOP);
  }
  kb.text(String(year), YM_NOOP).text("›", ymNavData(year + 1)).row();

  MONTHS.forEach((name, month) => {
    const isPast = today && (year < today.year || (year === today.year && month < today.month));
    if (isPast) {
      kb.text("—", YM_NOOP);
    } else {
      kb.text(name, ymPickData(year, month));
    }
    if (month % 3 === 2) kb.row();
  });

  kb.text("← В меню", MENU.main);
  return kb;
}

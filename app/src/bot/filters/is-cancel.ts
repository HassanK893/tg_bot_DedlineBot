import { MENU } from "../callback-data/menu.js";

/** callback_data всех кнопок «Отмена» внутри визардов. */
export const CANCEL_DATA = "wizard:cancel";

/**
 * Кнопка «В меню» встроена в buildCalendar с фиксированной callback_data
 * "menu:main" — внутри визарда она означает то же, что и наша "wizard:cancel".
 */
export function isCancel(data: string | undefined): boolean {
  return data === CANCEL_DATA || data === MENU.main;
}

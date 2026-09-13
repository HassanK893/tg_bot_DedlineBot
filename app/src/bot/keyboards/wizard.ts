import { InlineKeyboard } from "grammy";
import type { IntervalUnit } from "../../types/event.js";
import { MENU } from "../callback-data/menu.js";
import { EVENT_TYPE, SCHEDULE, STEP_SKIP, intervalUnitData } from "../callback-data/wizard.js";
import { CANCEL_DATA } from "../filters/is-cancel.js";

/**
 * Клавиатуры шагов визарда, не привязанные к конкретному пикеру: общие
 * «Отмена»/«Пропустить», выбор типа события, режима напоминаний и единицы
 * интервала. Используются и при создании, и при редактировании события.
 */

export const cancelOnlyKeyboard = () => new InlineKeyboard().text("✖ Отмена", CANCEL_DATA);

export const skipOrCancelKeyboard = () =>
  new InlineKeyboard().text("Пропустить", STEP_SKIP).row().text("✖ Отмена", CANCEL_DATA);

/** Единственная кнопка на финальных экранах визарда — назад в главное меню. */
export const toMainMenuKeyboard = () => new InlineKeyboard().text("🏠 В главное меню", MENU.main);

/** Шаг «Тип события»: разовое / ежемесячное. */
export const eventTypeKeyboard = () =>
  new InlineKeyboard()
    .text("Разовое", EVENT_TYPE.once)
    .text("Ежемесячное", EVENT_TYPE.monthly)
    .row()
    .text("✖ Отмена", CANCEL_DATA);

/** Шаг «Режим напоминаний»: свои даты / интервал. */
export const scheduleChoiceKeyboard = () =>
  new InlineKeyboard()
    .text("🗓 Свои даты", SCHEDULE.custom)
    .text("🔁 Интервал", SCHEDULE.interval)
    .row()
    .text("✖ Отмена", CANCEL_DATA);

/**
 * Единицы интервала — показываются только доступные (см. availableIntervalUnits):
 * часы и дни в первой строке, недели и месяцы во второй, пустые строки не рисуются.
 */
export function intervalUnitKeyboard(units: IntervalUnit[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (units.includes("hours")) kb.text("⏱ Часы", intervalUnitData("hours"));
  if (units.includes("days")) kb.text("📆 Дни", intervalUnitData("days"));
  if (units.includes("hours") || units.includes("days")) kb.row();
  if (units.includes("weeks")) kb.text("📅 Недели", intervalUnitData("weeks"));
  if (units.includes("months")) kb.text("🗓 Месяцы", intervalUnitData("months"));
  if (units.includes("weeks") || units.includes("months")) kb.row();
  kb.text("↩ Сменить режим", SCHEDULE.back).row().text("✖ Отмена", CANCEL_DATA);
  return kb;
}

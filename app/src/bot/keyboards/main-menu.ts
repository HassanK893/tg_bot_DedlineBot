import { InlineKeyboard } from "grammy";
import { MENU } from "../callback-data/menu.js";

/**
 * Главное меню — текст и три кнопки. Учёт «какое меню последнее» живёт
 * отдельно, в helpers/main-menu-tracker.ts: это состояние и вызовы API, а не
 * клавиатура.
 */

export function mainMenuText(name: string): string {
  return `Добро пожаловать, ${name}!\n\nЧто хотите сделать?`;
}

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Мои события", MENU.list)
    .row()
    .text("➕ Создать событие", MENU.create)
    .row()
    .text("⚙️ Часовой пояс", MENU.timezone);
}

import { InlineKeyboard } from "grammy";

export function mainMenuText(name: string): string {
  return `Добро пожаловать, ${name}!\n\nЧто хотите сделать?`;
}

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Мои события", "menu:list")
    .row()
    .text("➕ Создать событие", "menu:create");
}

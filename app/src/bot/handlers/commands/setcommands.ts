import type { Bot } from "grammy";
import type { Context } from "../../context.js";

/**
 * Список команд для попапа при вводе «/» плюс кнопка «Меню» рядом со скрепкой.
 * Без этого вызова подсказка при вводе «/» пустая, а кнопки «Меню» нет вовсе.
 *
 * Не middleware, а разовый вызов при старте процесса — поэтому вызывается из
 * точек входа (dev.ts, prod.ts), а не подключается к боту.
 */
export async function setCommands(bot: Bot<Context>): Promise<void> {
  await bot.api.setMyCommands([
    { command: "start", description: "Запуск / главное меню" },
    { command: "menu", description: "Главное меню" },
    { command: "test", description: "Пошаговая инструкция для проверки" },
    { command: "info", description: "Справка по функционалу" },
  ]);
  await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });
}

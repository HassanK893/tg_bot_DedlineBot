import { Composer } from "grammy";
import type { Context } from "../context.js";
import { MENU } from "../callback-data/menu.js";
import { markMainMenuMessage, staleOldMainMenu } from "../helpers/main-menu-tracker.js";
import { mainMenuKeyboard, mainMenuText } from "../keyboards/main-menu.js";
import * as userService from "../../modules/user/user.service.js";

const composer = new Composer<Context>();

/**
 * Каждый показ меню шлёт НОВОЕ сообщение, а кнопки предыдущего гасит: иначе в
 * чате остаётся несколько живых меню, и нажатие на старое выглядит как «бот
 * не реагирует».
 */
async function sendMainMenu(ctx: Context, name: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId !== undefined) await staleOldMainMenu(ctx, chatId);
  const sent = await ctx.reply(mainMenuText(name), { reply_markup: mainMenuKeyboard() });
  if (chatId !== undefined) markMainMenuMessage(chatId, sent.message_id);
}

composer.command("start", async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;
  const firstName = ctx.from?.first_name ?? "друг";
  const user = await userService.getOrCreateUser(telegramId, firstName);
  // Часовой пояс — единственный обязательный шаг онбординга: без него нельзя
  // посчитать, когда слать напоминания.
  if (!user.timezone) {
    await ctx.conversation.enter("selectTimezone");
    return;
  }
  await sendMainMenu(ctx, firstName);
});

composer.command("menu", async (ctx) => {
  await sendMainMenu(ctx, ctx.from?.first_name ?? "друг");
});

// Возврат в меню из подэкранов — редактируем текущее сообщение, а не шлём новое.
composer.callbackQuery(MENU.main, async (ctx) => {
  const name = ctx.from?.first_name ?? "друг";
  await ctx.editMessageText(mainMenuText(name), { reply_markup: mainMenuKeyboard() });
  await ctx.answerCallbackQuery();
});

export { composer as mainMenuFeature };

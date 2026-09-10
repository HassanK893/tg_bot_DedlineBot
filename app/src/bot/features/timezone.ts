import { Composer } from "grammy";
import type { Context as BotContext, ConversationContext as Context, MyConversation } from "../context.js";
import { MENU, TIMEZONE_PICK_PATTERN } from "../callback-data/menu.js";
import { answerStaleCallback, tryDelete } from "../helpers/screen.js";
import { buildTimezonePicker, TIMEZONE_OPTIONS } from "../keyboards/timezone.js";
import { mainMenuKeyboard, mainMenuText, markMainMenuMessage, staleOldMainMenu } from "../keyboards/main-menu.js";
import * as userService from "../../modules/user/user.service.js";

/**
 * Выбор часового пояса — единственный обязательный шаг онбординга. Вызывается
 * и на первом /start (если ещё не выбран), и повторно из настроек, поэтому
 * всегда шлёт новое сообщение (а не редактирует существующее): у /start нет
 * своего сообщения бота, которое можно было бы редактировать.
 */
export async function selectTimezoneConversation(conversation: MyConversation, ctx: Context) {
  const rawTelegramId = ctx.from?.id;
  if (rawTelegramId === undefined) return;
  const telegramId: number = rawTelegramId;

  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

  const rawChatId = ctx.chat?.id;
  if (rawChatId !== undefined) await staleOldMainMenu(ctx, rawChatId);

  const sent = await ctx.reply(
    "👋 Прежде чем начать — выберите свой часовой пояс. Он нужен, чтобы напоминания приходили в правильное время.",
    { reply_markup: buildTimezonePicker() },
  );
  const chatId = sent.chat.id;
  const messageId = sent.message_id;

  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }
    const match = data.match(TIMEZONE_PICK_PATTERN);
    if (!match) {
      await answerStaleCallback(next);
      continue;
    }
    const index = Number(match[1]);
    const option = TIMEZONE_OPTIONS[index];
    if (!option) {
      await answerStaleCallback(next);
      continue;
    }

    await next.answerCallbackQuery();
    await conversation.external(() => userService.setTimezone(telegramId, option.zone));

    const name = ctx.from?.first_name ?? "друг";
    await ctx.api.editMessageText(
      chatId,
      messageId,
      `Часовой пояс сохранён: ${option.label}.\n\n${mainMenuText(name)}`,
      { reply_markup: mainMenuKeyboard() },
    );
    markMainMenuMessage(chatId, messageId);
    return;
  }
}

// --- регистрация -------------------------------------------------------------
// createConversation(selectTimezoneConversation, "selectTimezone") подключается
// в bot/index.ts — из-за порядка middleware (см. комментарий там).

const composer = new Composer<BotContext>();

composer.callbackQuery(MENU.timezone, async (ctx) => {
  await ctx.conversation.enter("selectTimezone");
});

export { composer as timezoneFeature };

import { Composer } from "grammy";
import type { Context as BotContext, ConversationContext as Context, MyConversation } from "../context.js";
import { MENU, parseTimezonePick } from "../callback-data/menu.js";
import { markMainMenuMessage, staleOldMainMenu } from "../helpers/main-menu-tracker.js";
import { answerStaleCallback, tryDelete } from "../helpers/screen.js";
import { buildTimezonePicker, TIMEZONE_OPTIONS, type TimezoneOption } from "../keyboards/timezone.js";
import { mainMenuKeyboard, mainMenuText } from "../keyboards/main-menu.js";
import * as userService from "../../modules/user/user.service.js";

const TIMEZONE_PROMPT =
  "👋 Прежде чем начать — выберите свой часовой пояс. Он нужен, чтобы напоминания приходили в правильное время.";

/** После сохранения тот же экран превращается в главное меню — новое сообщение не шлём. */
function timezoneSavedText(option: TimezoneOption, name: string): string {
  return `Часовой пояс сохранён: ${option.label}.\n\n${mainMenuText(name)}`;
}

/**
 * Ждёт тап по одному из поясов из TIMEZONE_OPTIONS. Текст убираем из чата,
 * чужой callback или несуществующий индекс объясняем алертом и ждём дальше.
 * На выбранную кнопку отвечает сам — вызывающему остаётся только сохранить.
 */
async function waitTimezonePick(conversation: MyConversation): Promise<TimezoneOption> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }
    const index = parseTimezonePick(data);
    if (index === null) {
      await answerStaleCallback(next);
      continue;
    }
    const option = TIMEZONE_OPTIONS[index];
    if (!option) {
      await answerStaleCallback(next);
      continue;
    }

    await next.answerCallbackQuery();
    return option;
  }
}

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

  const sent = await ctx.reply(TIMEZONE_PROMPT, { reply_markup: buildTimezonePicker() });
  const chatId = sent.chat.id;
  const messageId = sent.message_id;

  const option = await waitTimezonePick(conversation);
  await conversation.external(() => userService.setTimezone(telegramId, option.zone));

  const name = ctx.from?.first_name ?? "друг";
  await ctx.api.editMessageText(chatId, messageId, timezoneSavedText(option, name), {
    reply_markup: mainMenuKeyboard(),
  });
  markMainMenuMessage(chatId, messageId);
}

// --- регистрация -------------------------------------------------------------
// createConversation(selectTimezoneConversation, "selectTimezone") подключается
// в bot/index.ts — из-за порядка middleware (см. комментарий там).

const composer = new Composer<BotContext>();

composer.callbackQuery(MENU.timezone, async (ctx) => {
  await ctx.conversation.enter("selectTimezone");
});

export { composer as timezoneFeature };

import { InlineKeyboard } from "grammy";
import type { ConversationContext as Context } from "../context.js";
import { CANCEL_DATA } from "../filters/is-cancel.js";

/**
 * Базовые операции над «экраном» визарда — одним сообщением бота, которое
 * переписывается на каждом шаге вместо отправки нового. Ни один шаг сюда
 * ничего не знает про конкретное поле: это низ стека, поверх которого
 * работают и создание события, и редактирование.
 */

/**
 * Все экраны визарда отправляются с parse_mode: "HTML" — единая точка,
 * чтобы не забыть его на одном из мест правки сообщения.
 */
export async function renderScreen(
  ctx: Context,
  chatId: number,
  messageId: number,
  text: string,
  keyboard: InlineKeyboard,
) {
  await ctx.api.editMessageText(chatId, messageId, text, {
    reply_markup: keyboard,
    parse_mode: "HTML",
  });
}

export async function tryDelete(ctx: Context) {
  try {
    await ctx.deleteMessage();
  } catch {
    // сообщение могло устареть, или у бота нет прав — для теста не критично
  }
}

const STALE_CALLBACK_MESSAGE =
  "Это старое меню — у вас уже открыт другой диалог. Закончите его или нажмите «✖ Отмена» в текущем сообщении.";

/**
 * Тап по кнопке из чужого/устаревшего сообщения, пока идёт этот диалог —
 * grammY conversations забирает себе все апдейты чата, такой тап не подходит
 * ни под один ожидаемый шаг. Без ответа кнопка просто «зависает» без
 * объяснений — отвечаем алертом вместо тишины.
 */
export async function answerStaleCallback(ctx: Context): Promise<void> {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCallbackQuery({ text: STALE_CALLBACK_MESSAGE, show_alert: true });
  } catch {
    // callback мог устареть — не критично
  }
}

/**
 * Единая реакция на апдейт, которого текущий шаг не ждал: сообщение (не тот
 * тип ответа, стикер, команда) убираем из чата, чтобы оно не копилось и не
 * попало в поле как значение; чужой или устаревший callback объясняем алертом.
 * В обоих случаях шаг просто продолжает ждать нужный апдейт.
 */
export async function skipUnexpected(ctx: Context): Promise<void> {
  if (ctx.message) await tryDelete(ctx);
  else await answerStaleCallback(ctx);
}

// --- клавиатуры, общие для всех шагов ----------------------------------------

export const cancelOnlyKeyboard = () => new InlineKeyboard().text("✖ Отмена", CANCEL_DATA);

export const skipOrCancelKeyboard = () =>
  new InlineKeyboard().text("Пропустить", "step:skip").row().text("✖ Отмена", CANCEL_DATA);

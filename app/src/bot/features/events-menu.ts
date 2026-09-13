import { Composer } from "grammy";
import type { Context as BotContext, ConversationContext as Context } from "../context.js";
import type { User } from "../../generated/prisma/client.js";
import { eventPattern, type EventAction } from "../callback-data/event.js";
import { MENU } from "../callback-data/menu.js";
import {
  DELETE_QUESTION,
  EMPTY_LIST_TEXT,
  LIST_TEXT,
  doneQuestion,
  eventCardText,
} from "../helpers/event-card.js";
import {
  confirmDeleteKeyboard,
  confirmDoneKeyboard,
  emptyListKeyboard,
  eventDetailKeyboard,
  eventListKeyboard,
} from "../keyboards/events-menu.js";
import * as eventService from "../../modules/event/event.service.js";
import * as userService from "../../modules/user/user.service.js";

/**
 * Плоские callback-хендлеры (не conversation — тут нет свободного ввода,
 * только тап по кнопкам, реплей grammY conversations тут не нужен и не
 * применяется). Регистрируются в bot/index.ts.
 *
 * Тексты экранов — helpers/event-card.ts, клавиатуры — keyboards/events-menu.ts;
 * здесь только «достать из БД → нарисовать».
 */

/** Гасим «часики» на нажатой кнопке; для не-callback апдейтов ничего не делаем. */
async function answerIfCallback(ctx: Context): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
}

async function resolveUser(ctx: Context): Promise<User | undefined> {
  const telegramId = ctx.from?.id;
  if (telegramId === undefined) return undefined;
  return userService.getByTelegramId(telegramId);
}

interface Screen {
  chatId: number;
  messageId: number;
  user: User;
}

/**
 * Общий пролог всех экранов меню: гасим «часики» на нажатой кнопке и достаём
 * то, без чего экран не нарисовать. undefined — рисовать нечего, хендлер молча
 * выходит.
 */
async function openScreen(ctx: Context): Promise<Screen | undefined> {
  await answerIfCallback(ctx);
  const chatId = ctx.chatId;
  const messageId = ctx.msgId;
  const user = await resolveUser(ctx);
  if (chatId === undefined || messageId === undefined || user === undefined) return undefined;
  return { chatId, messageId, user };
}

// --- экраны ------------------------------------------------------------------

export async function showList(ctx: Context) {
  const screen = await openScreen(ctx);
  if (!screen) return;
  const { chatId, messageId, user } = screen;

  const events = await eventService.listByUser(user.id);

  if (events.length === 0) {
    await ctx.api.editMessageText(chatId, messageId, EMPTY_LIST_TEXT, { reply_markup: emptyListKeyboard() });
    return;
  }

  await ctx.api.editMessageText(chatId, messageId, LIST_TEXT, {
    reply_markup: eventListKeyboard(events),
    parse_mode: "HTML",
  });
}

export async function showDetail(ctx: Context, eventId: string) {
  const screen = await openScreen(ctx);
  if (!screen) return;
  const { chatId, messageId, user } = screen;

  const event = await eventService.getForUser(eventId, user.id);
  const draft = eventService.toDraftShape(event);

  await ctx.api.editMessageText(chatId, messageId, eventCardText(event, draft), {
    reply_markup: eventDetailKeyboard(event),
    parse_mode: "HTML",
  });
}

export async function confirmDelete(ctx: Context, eventId: string) {
  await answerIfCallback(ctx);
  const chatId = ctx.chatId;
  const messageId = ctx.msgId;
  if (chatId === undefined || messageId === undefined) return;

  await ctx.api.editMessageText(chatId, messageId, DELETE_QUESTION, {
    reply_markup: confirmDeleteKeyboard(eventId),
  });
}

export async function confirmDone(ctx: Context, eventId: string) {
  const screen = await openScreen(ctx);
  if (!screen) return;
  const { chatId, messageId, user } = screen;

  const event = await eventService.getForUser(eventId, user.id);

  await ctx.api.editMessageText(chatId, messageId, doneQuestion(event), {
    reply_markup: confirmDoneKeyboard(eventId),
  });
}

// --- действия: изменить в БД и перерисовать карточку/список --------------------

export async function pause(ctx: Context, eventId: string) {
  await answerIfCallback(ctx);
  const user = await resolveUser(ctx);
  if (user === undefined) return;
  await eventService.pauseEvent(eventId, user.id);
  await showDetail(ctx, eventId);
}

export async function resume(ctx: Context, eventId: string) {
  await answerIfCallback(ctx);
  const user = await resolveUser(ctx);
  if (user === undefined || !user.timezone) return;
  await eventService.resumeEvent(eventId, user.id, user.timezone);
  await showDetail(ctx, eventId);
}

export async function doDelete(ctx: Context, eventId: string) {
  await answerIfCallback(ctx);
  const user = await resolveUser(ctx);
  if (user === undefined) return;
  await eventService.deleteEvent(eventId, user.id);
  await showList(ctx);
}

export async function doDone(ctx: Context, eventId: string) {
  await answerIfCallback(ctx);
  const user = await resolveUser(ctx);
  if (user === undefined) return;
  const { deleted } = await eventService.markDone(eventId, user.id);
  if (deleted) {
    await showList(ctx);
  } else {
    await showDetail(ctx, eventId);
  }
}

export async function restore(ctx: Context, eventId: string) {
  await answerIfCallback(ctx);
  const user = await resolveUser(ctx);
  if (user === undefined || !user.timezone) return;
  await eventService.restoreCycle(eventId, user.id, user.timezone);
  await showDetail(ctx, eventId);
}

// --- регистрация -------------------------------------------------------------

const composer = new Composer<BotContext>();

/**
 * Все действия над событием устроены одинаково: достать id из callback_data и
 * передать в обработчик. Обёртка нужна, чтобы не повторять одну и ту же
 * проверку «id есть?» девять раз подряд.
 */
function onEvent(action: EventAction, handler: (ctx: Context, id: string) => Promise<void>) {
  composer.callbackQuery(eventPattern(action), async (ctx) => {
    const id = ctx.match?.[1];
    if (id) await handler(ctx, id);
    else await ctx.answerCallbackQuery();
  });
}

composer.callbackQuery(MENU.list, async (ctx) => {
  await showList(ctx);
});

onEvent("view", showDetail);
onEvent("pause", pause);
onEvent("resume", resume);
onEvent("restore", restore);
onEvent("delete:confirm", confirmDelete);
onEvent("delete:do", doDelete);
onEvent("done:confirm", confirmDone);
onEvent("done:do", doDone);
// "edit" обрабатывается в features/edit-event/ — там же, где сам визард.

export { composer as eventsMenuFeature };

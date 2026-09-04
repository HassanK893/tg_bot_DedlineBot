import { Composer, InlineKeyboard } from "grammy";
import type { Context as BotContext, ConversationContext as Context } from "../context.js";
import type { User } from "../../generated/prisma/client.js";
import { eventData, eventPattern } from "../callback-data/event.js";
import { MENU } from "../callback-data/menu.js";
import { summarizeDraft } from "../helpers/event-steps.js";
import * as eventService from "../../modules/event/event.service.js";
import * as userService from "../../modules/user/user.service.js";

/**
 * Плоские callback-хендлеры (не conversation — тут нет свободного ввода,
 * только тап по кнопкам, реплей grammY conversations тут не нужен и не
 * применяется). Регистрируются в bot/index.ts.
 */

function stateIcon(state: string): string {
  return state === "ACTIVE" ? "🟢" : "⏸";
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  const chatId = ctx.chatId;
  const messageId = ctx.msgId;
  const user = await resolveUser(ctx);
  if (chatId === undefined || messageId === undefined || user === undefined) return undefined;
  return { chatId, messageId, user };
}

export async function showList(ctx: Context) {
  const screen = await openScreen(ctx);
  if (!screen) return;
  const { chatId, messageId, user } = screen;

  const events = await eventService.listByUser(user.id);

  if (events.length === 0) {
    await ctx.api.editMessageText(
      chatId,
      messageId,
      "Событий пока нет.\n\nСоздайте первое через «➕ Создать событие».",
      { reply_markup: new InlineKeyboard().text("← Назад", "menu:main") },
    );
    return;
  }

  const kb = new InlineKeyboard();
  for (const event of events) {
    kb.text(`${stateIcon(event.state)} Событие: ${truncate(event.name, 35)}`, eventData("view", event.id)).row();
  }
  kb.text("← Назад", "menu:main");

  await ctx.api.editMessageText(chatId, messageId, "📋 <b>Мои события</b>\n\nВыберите событие.", {
    reply_markup: kb,
    parse_mode: "HTML",
  });
}

export async function showDetail(ctx: Context, eventId: string) {
  const screen = await openScreen(ctx);
  if (!screen) return;
  const { chatId, messageId, user } = screen;

  const event = await eventService.getForUser(eventId, user.id);
  const draft = eventService.toDraftShape(event);

  const lines = [
    `${stateIcon(event.state)} <b>${event.state === "ACTIVE" ? "Активно" : "На паузе"}</b>`,
  ];
  if (event.doneThisCycle) {
    lines.push("⏳ <i>Приостановлено до следующего месяца</i>");
  }
  lines.push("", summarizeDraft(draft));

  const kb = new InlineKeyboard();
  if (event.state === "ACTIVE") {
    kb.text("⏸ Пауза", eventData("pause", event.id)).row();
  } else {
    kb.text("▶️ Возобновить", eventData("resume", event.id)).row();
  }
  if (event.doneThisCycle) {
    kb.text("🔄 Восстановить этот месяц", eventData("restore", event.id)).row();
  } else {
    kb.text("✅ Done", eventData("done:confirm", event.id)).row();
  }
  kb.text("✏️ Редактировать", eventData("edit", event.id)).row();
  kb.text("🗑 Удалить", eventData("delete:confirm", event.id)).row();
  kb.text("← К списку", MENU.list);

  await ctx.api.editMessageText(chatId, messageId, lines.join("\n"), { reply_markup: kb, parse_mode: "HTML" });
}

export async function pause(ctx: Context, eventId: string) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  const user = await resolveUser(ctx);
  if (user === undefined) return;
  await eventService.pauseEvent(eventId, user.id);
  await showDetail(ctx, eventId);
}

export async function resume(ctx: Context, eventId: string) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  const user = await resolveUser(ctx);
  if (user === undefined || !user.timezone) return;
  await eventService.resumeEvent(eventId, user.id, user.timezone);
  await showDetail(ctx, eventId);
}

export async function confirmDelete(ctx: Context, eventId: string) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  const chatId = ctx.chatId;
  const messageId = ctx.msgId;
  if (chatId === undefined || messageId === undefined) return;

  await ctx.api.editMessageText(chatId, messageId, "Удалить это событие вместе со всеми напоминаниями?", {
    reply_markup: new InlineKeyboard()
      .text("🗑 Да, удалить", eventData("delete:do", eventId))
      .text("Отмена", eventData("view", eventId)),
  });
}

export async function doDelete(ctx: Context, eventId: string) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  const user = await resolveUser(ctx);
  if (user === undefined) return;
  await eventService.deleteEvent(eventId, user.id);
  await showList(ctx);
}

export async function confirmDone(ctx: Context, eventId: string) {
  const screen = await openScreen(ctx);
  if (!screen) return;
  const { chatId, messageId, user } = screen;

  const event = await eventService.getForUser(eventId, user.id);
  const question =
    event.kind === "ONCE"
      ? "Пометить событие выполненным? Оно будет удалено вместе со всеми оставшимися напоминаниями."
      : "Пометить выполненным до конца месяца? Оставшиеся напоминания в этом цикле снимутся, событие само возобновится в следующем месяце — или нажмите «Восстановить» раньше.";

  await ctx.api.editMessageText(chatId, messageId, question, {
    reply_markup: new InlineKeyboard()
      .text("✅ Да, готово", eventData("done:do", eventId))
      .text("Отмена", eventData("view", eventId)),
  });
}

export async function doDone(ctx: Context, eventId: string) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
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
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
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
function onEvent(action: Parameters<typeof eventPattern>[0], handler: (ctx: Context, id: string) => Promise<void>) {
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
// "edit" обрабатывается в features/edit-event.ts — там же, где сам визард.

export { composer as eventsMenuFeature };

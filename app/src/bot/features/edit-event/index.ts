import { Composer } from "grammy";
import type { Context as BotContext, ConversationContext as Context, MyConversation } from "../../context.js";
import { EDIT_DONE, EDIT_FIELD } from "../../callback-data/edit.js";
import { eventPattern } from "../../callback-data/event.js";
import { isCancel } from "../../filters/is-cancel.js";
import { answerStaleCallback, tryDelete } from "../../helpers/screen.js";
import { editMenuKeyboard } from "../../keyboards/edit-event.js";
import { showDetail } from "../events-menu.js";
import * as userService from "../../../modules/user/user.service.js";
import { editBoundaryDate } from "./boundary-date.js";
import { editKind } from "./kind.js";
import { editPhotoField, editTextField } from "./scalar-fields.js";
import { editSchedule } from "./schedule.js";
import { openEditSession, type EditSession } from "./session.js";

/**
 * Редактирование уже созданного события — точечное подменю на 8 полей (те же
 * шаги, что и в визарде создания), каждое прогоняется через тот же UI-код
 * (helpers/steps/). Тип события теперь тоже редактируем — со сбросом дат и
 * напоминаний (см. kind.ts), это осознанное решение пользователя.
 *
 * Здесь только цикл подменю и раскладка «кнопка → под-шаг»; сами под-шаги —
 * в соседних файлах, состояние сеанса — в session.ts.
 */

/**
 * Какой под-шаг запускает каждая кнопка подменю. Map, а не объект: callback_data
 * приходит от клиента, и через объект по ключу вроде "constructor" можно было бы
 * достать что-то из прототипа.
 */
const FIELD_STEPS = new Map<string, (session: EditSession) => Promise<void>>([
  [EDIT_FIELD.name, (session) => editTextField(session, "Название", "name")],
  [EDIT_FIELD.description, (session) => editTextField(session, "Описание", "description")],
  [EDIT_FIELD.reminderText, (session) => editTextField(session, "Текст напоминаний", "reminderText")],
  [EDIT_FIELD.photo, editPhotoField],
  [EDIT_FIELD.kind, editKind],
  [EDIT_FIELD.startDate, (session) => editBoundaryDate(session, "start")],
  [EDIT_FIELD.endDate, (session) => editBoundaryDate(session, "end")],
  [EDIT_FIELD.schedule, editSchedule],
]);

export async function editEventConversation(conversation: MyConversation, ctx: Context, eventId: string) {
  const rawChatId = ctx.chatId;
  const rawMessageId = ctx.msgId;
  const rawTelegramId = ctx.from?.id;
  if (rawChatId === undefined || rawMessageId === undefined || rawTelegramId === undefined) return;
  const chatId: number = rawChatId;
  const messageId: number = rawMessageId;
  const telegramId: number = rawTelegramId;

  await ctx.answerCallbackQuery();

  // DB-вызовы внутри conversation-функции реплеятся при каждом апдейте —
  // conversation.external гарантирует, что побочный эффект случится ровно раз.
  const user = await conversation.external(() => userService.getByTelegramId(telegramId));
  if (!user.timezone) return;

  const session = await openEditSession(conversation, ctx, chatId, messageId, eventId, {
    id: user.id,
    timezone: user.timezone,
  });

  // showDetail() сам отвечает на callbackQuery — если передать туда исходный
  // ctx, на который answerCallbackQuery уже вызывался выше, Telegram вернёт
  // ошибку «query is too old». Поэтому в конце используем последний next.
  let exitCtx: Context = ctx;

  while (true) {
    await session.render("Что изменить?", editMenuKeyboard());

    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }

    if (data === EDIT_DONE || isCancel(data)) {
      exitCtx = next;
      break;
    }

    const step = FIELD_STEPS.get(data);
    if (step) {
      await next.answerCallbackQuery();
      await step(session);
      await session.reloadDraft();
      continue;
    }

    await answerStaleCallback(next);
  }

  await showDetail(exitCtx, eventId);
}

// --- регистрация -------------------------------------------------------------
// createConversation(editEventConversation, "editEvent") подключается в
// bot/index.ts — из-за порядка middleware (см. комментарий там).

const composer = new Composer<BotContext>();

composer.callbackQuery(eventPattern("edit"), async (ctx) => {
  const id = ctx.match?.[1];
  if (!id) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.conversation.enter("editEvent", id);
});

export { composer as editEventFeature };

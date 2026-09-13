import { Composer, type InlineKeyboard } from "grammy";
import type { Context as BotContext, ConversationContext as Context, MyConversation } from "../context.js";
import { MENU } from "../callback-data/menu.js";
import { EVENT_TYPE } from "../callback-data/wizard.js";
import {
  runDateAndScheduleFlow,
  waitChoice,
  waitPhotoField,
  waitTextField,
  type WizardScreen,
} from "../helpers/steps/index.js";
import { renderScreen } from "../helpers/screen.js";
import { summarizeDraft } from "../helpers/summarize-draft.js";
import { mainMenuKeyboard, mainMenuText } from "../keyboards/main-menu.js";
import {
  cancelOnlyKeyboard,
  eventTypeKeyboard,
  skipOrCancelKeyboard,
  toMainMenuKeyboard,
} from "../keyboards/wizard.js";
import type { CompleteEventDraft, EventDraft } from "../../types/event.js";
import * as eventService from "../../modules/event/event.service.js";
import * as userService from "../../modules/user/user.service.js";

/**
 * Оркестрация создания события: 8 шагов, каждый прогоняется через
 * переиспользуемые примитивы из helpers/steps/ (общие с features/edit-event/). Здесь
 * только последовательность шагов, живая форма (fieldsSummary/formText) и
 * финальный персист в БД + постановка напоминаний в очередь.
 */

/** Заголовок живой формы на всех шагах создания. */
function createFormText(draft: EventDraft, question: string): string {
  return ["📋 <b>Создание события</b>", "", summarizeDraft(draft), "", `<i>${question}</i>`].join("\n");
}

/** Финальный экран после успешного персиста. */
function createdText(draft: EventDraft, scheduledCount: number): string {
  return [
    "✅ <b>Событие успешно создано</b>",
    "",
    summarizeDraft(draft),
    "",
    `<i>Запланировано напоминаний: ${scheduledCount}.</i>`,
  ].join("\n");
}

/** Все обязательные поля на месте — можно сохранять. */
function isComplete(draft: EventDraft): draft is CompleteEventDraft {
  return Boolean(
    draft.name &&
      draft.description &&
      draft.reminderText &&
      draft.kind &&
      draft.startDate &&
      draft.endDate &&
      draft.scheduleType,
  );
}

export async function createEventConversation(conversation: MyConversation, ctx: Context) {
  const rawChatId = ctx.chatId;
  const rawMessageId = ctx.msgId;
  const rawTelegramId = ctx.from?.id;
  if (rawChatId === undefined || rawMessageId === undefined || rawTelegramId === undefined) return;
  // переприсваиваем как гарантированный number — TS не сохраняет сужение
  // union-типа внутри вложенных функций (renderForm, finishCancelled и т.д.)
  const chatId: number = rawChatId;
  const messageId: number = rawMessageId;
  const telegramId: number = rawTelegramId;
  const firstName = ctx.from?.first_name ?? "друг";

  await ctx.answerCallbackQuery();

  // DB-вызовы внутри conversation-функции реплеятся при каждом новом апдейте —
  // conversation.external гарантирует, что побочный эффект случится ровно раз.
  const user = await conversation.external(() => userService.getOrCreateUser(telegramId, firstName));
  if (!user.timezone) {
    await renderScreen(ctx, chatId, messageId, "Сначала выберите часовой пояс — наберите /start.", toMainMenuKeyboard());
    return;
  }
  const timezone = user.timezone;

  const draft: EventDraft = {};

  const screen: WizardScreen = {
    conversation,
    ctx,
    chatId,
    messageId,
    formText: (question) => createFormText(draft, question),
  };

  async function renderForm(question: string, keyboard: InlineKeyboard) {
    await renderScreen(ctx, chatId, messageId, screen.formText(question), keyboard);
  }

  async function finishCancelled() {
    const name = ctx.from?.first_name ?? "друг";
    await ctx.api.editMessageText(chatId, messageId, mainMenuText(name), {
      reply_markup: mainMenuKeyboard(),
    });
  }

  // --- 1. Название (обязательно) ---------------------------------------

  await renderForm("Шаг 1 из 8. Введите название события.", cancelOnlyKeyboard());
  const nameRes = await waitTextField(conversation, false);
  if (nameRes.kind === "cancel") {
    await finishCancelled();
    return;
  }
  if (nameRes.kind === "text") draft.name = nameRes.value;

  // --- 2. Описание (обязательно) ------------------------------------------

  await renderForm("Шаг 2 из 8. Введите описание события.", cancelOnlyKeyboard());
  const descRes = await waitTextField(conversation, false);
  if (descRes.kind === "cancel") {
    await finishCancelled();
    return;
  }
  if (descRes.kind === "text") draft.description = descRes.value;

  // --- 3. Текст напоминаний (обязательно) ----------------------------------

  await renderForm("Шаг 3 из 8. Введите текст, который будет приходить в напоминаниях.", cancelOnlyKeyboard());
  const remRes = await waitTextField(conversation, false);
  if (remRes.kind === "cancel") {
    await finishCancelled();
    return;
  }
  if (remRes.kind === "text") draft.reminderText = remRes.value;

  // --- 4. Фото (опционально) ----------------------------------------------

  await renderForm("Шаг 4 из 8. Пришлите фото для события — или нажмите «Пропустить».", skipOrCancelKeyboard());
  const photoRes = await waitPhotoField(conversation);
  if (photoRes.kind === "cancel") {
    await finishCancelled();
    return;
  }
  if (photoRes.kind === "photo") draft.photoFileId = photoRes.fileId;

  // --- 5. Тип события ------------------------------------------------------

  await renderForm("Шаг 5 из 8. Выберите тип события.", eventTypeKeyboard());
  const typeRes = await waitChoice(conversation, [EVENT_TYPE.once, EVENT_TYPE.monthly]);
  if (typeRes.kind === "cancel") {
    await finishCancelled();
    return;
  }
  draft.kind = typeRes.value === EVENT_TYPE.once ? "once" : "monthly";

  // --- 6-8. Даты начала/конца + режим напоминаний ---------------------------
  // Разовое: свободный календарь. Ежемесячное: сначала фиксируем месяц
  // отдельным шагом, дальше начало и конец выбираются днями внутри него.
  // Общая логика (используется и здесь, и в features/edit-event/) — в helpers/steps/.

  const scheduleRes = await runDateAndScheduleFlow(screen, draft, {
    start: "Шаг 6 из 8.",
    end: "Шаг 7 из 8.",
    schedule: "Шаг 8 из 8.",
  });
  if (scheduleRes === "cancel") {
    await finishCancelled();
    return;
  }

  // --- Персист в БД + постановка напоминаний в очередь ----------------------

  if (!isComplete(draft)) {
    await finishCancelled(); // не должно происходить — все поля обязательны по шагам выше
    return;
  }

  const { scheduledCount } = await conversation.external(() => eventService.createEvent(user.id, draft, timezone));

  await renderScreen(ctx, chatId, messageId, createdText(draft, scheduledCount), toMainMenuKeyboard());
}

// --- регистрация -------------------------------------------------------------
// createConversation(createEventConversation, "createEvent") подключается в
// bot/index.ts — из-за порядка middleware (см. комментарий там).

const composer = new Composer<BotContext>();

composer.callbackQuery(MENU.create, async (ctx) => {
  await ctx.conversation.enter("createEvent");
});

export { composer as createEventFeature };

import { Context, InlineKeyboard } from "grammy";
import {
  cancelOnlyKeyboard,
  MyConversation,
  renderScreen,
  runDateAndScheduleFlow,
  skipOrCancelKeyboard,
  summarizeDraft,
  waitChoice,
  waitPhotoField,
  waitTextField,
} from "./eventSteps.js";
import { mainMenuKeyboard, mainMenuText } from "./mainMenu.js";
import type { CompleteEventDraft, EventDraft } from "../types/event.js";
import * as eventService from "../modules/event/event.service.js";
import * as userService from "../modules/user/user.service.js";

/**
 * Оркестрация создания события: 8 шагов, каждый прогоняется через
 * переиспользуемые примитивы из eventSteps.ts (общие с editWizard.ts). Здесь
 * только последовательность шагов, живая форма (fieldsSummary/formText) и
 * финальный персист в БД + постановка напоминаний в очередь.
 */

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
    await renderScreen(
      ctx,
      chatId,
      messageId,
      "Сначала выберите часовой пояс — наберите /start.",
      new InlineKeyboard().text("🏠 В главное меню", "menu:main"),
    );
    return;
  }
  const timezone = user.timezone;

  const draft: EventDraft = {};

  function fieldsSummary(): string {
    return summarizeDraft(draft);
  }

  function formText(question: string): string {
    return ["📋 <b>Создание события</b>", "", fieldsSummary(), "", `<i>${question}</i>`].join("\n");
  }

  async function renderForm(question: string, keyboard: InlineKeyboard) {
    await renderScreen(ctx, chatId, messageId, formText(question), keyboard);
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

  await renderForm(
    "Шаг 3 из 8. Введите текст, который будет приходить в напоминаниях.",
    cancelOnlyKeyboard(),
  );
  const remRes = await waitTextField(conversation, false);
  if (remRes.kind === "cancel") {
    await finishCancelled();
    return;
  }
  if (remRes.kind === "text") draft.reminderText = remRes.value;

  // --- 4. Фото (опционально) ----------------------------------------------

  await renderForm(
    "Шаг 4 из 8. Пришлите фото для события — или нажмите «Пропустить».",
    skipOrCancelKeyboard(),
  );
  const photoRes = await waitPhotoField(conversation);
  if (photoRes.kind === "cancel") {
    await finishCancelled();
    return;
  }
  if (photoRes.kind === "photo") draft.photoFileId = photoRes.fileId;

  // --- 5. Тип события ------------------------------------------------------

  await renderForm(
    "Шаг 5 из 8. Выберите тип события.",
    new InlineKeyboard()
      .text("Разовое", "type:once")
      .text("Ежемесячное", "type:monthly")
      .row()
      .text("✖ Отмена", "wizard:cancel"),
  );
  const typeRes = await waitChoice(conversation, ["type:once", "type:monthly"]);
  if (typeRes.kind === "cancel") {
    await finishCancelled();
    return;
  }
  draft.kind = typeRes.value === "type:once" ? "once" : "monthly";

  // --- 6-8. Даты начала/конца + режим напоминаний ---------------------------
  // Разовое: свободный календарь. Ежемесячное: сначала фиксируем месяц
  // отдельным шагом, дальше начало и конец выбираются днями внутри него.
  // Общая логика (используется и здесь, и в editWizard.ts) — в eventSteps.ts.

  const scheduleRes = await runDateAndScheduleFlow(conversation, ctx, chatId, messageId, formText, draft, {
    start: "Шаг 6 из 8.",
    end: "Шаг 7 из 8.",
    schedule: "Шаг 8 из 8.",
  });
  if (scheduleRes === "cancel") {
    await finishCancelled();
    return;
  }

  // --- Персист в БД + постановка напоминаний в очередь ----------------------

  if (!draft.name || !draft.description || !draft.reminderText || !draft.kind || !draft.startDate || !draft.endDate || !draft.scheduleType) {
    await finishCancelled(); // не должно происходить — все поля обязательны по шагам выше
    return;
  }
  const completeDraft = draft as CompleteEventDraft;

  const { scheduledCount } = await conversation.external(() =>
    eventService.createEvent(user.id, completeDraft, timezone),
  );

  await renderScreen(
    ctx,
    chatId,
    messageId,
    [
      "✅ <b>Событие успешно создано</b>",
      "",
      fieldsSummary(),
      "",
      `<i>Запланировано напоминаний: ${scheduledCount}.</i>`,
    ].join("\n"),
    new InlineKeyboard().text("🏠 В главное меню", "menu:main"),
  );
}

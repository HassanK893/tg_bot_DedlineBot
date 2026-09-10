import { Composer, InlineKeyboard } from "grammy";
import type { Context as BotContext, ConversationContext as Context, MyConversation } from "../context.js";
import { eventPattern } from "../callback-data/event.js";
import { isCancel } from "../filters/is-cancel.js";
import {
  pickCalendarDate,
  pickFixedMonthDate,
  runCustomDatesFlow,
  runDateAndScheduleFlow,
  runIntervalFlow,
  waitChoice,
  waitPhotoField,
  waitTextField,
} from "../helpers/event-steps.js";
import {
  answerStaleCallback,
  cancelOnlyKeyboard,
  renderScreen,
  skipUnexpected,
  tryDelete,
} from "../helpers/screen.js";
import { summarizeDraft } from "../helpers/summarize-draft.js";
import { formatDate, type CalendarRange } from "../keyboards/calendar.js";
import { showDetail } from "./events-menu.js";
import type { CompleteEventDraft, DatePart, EventDraft, EventKind } from "../../types/event.js";
import { escapeHtml } from "../../utils/html.js";
import { dateSortKey } from "../../utils/datePart.js";
import * as eventService from "../../modules/event/event.service.js";
import * as userService from "../../modules/user/user.service.js";

/**
 * Редактирование уже созданного события — точечное подменю на 8 полей (те же
 * шаги, что и в визарде создания), каждое прогоняется через тот же UI-код
 * (helpers/event-steps.ts). Тип события теперь тоже редактируем — со сбросом дат и
 * напоминаний (см. edit:field:kind), это осознанное решение пользователя.
 */
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
  const timezone = user.timezone;

  async function loadDraft(): Promise<EventDraft> {
    const event = await eventService.getForUser(eventId, user.id);
    return eventService.toDraftShape(event);
  }

  let draft: EventDraft = await conversation.external(loadDraft);

  function formText(question: string): string {
    return ["✏️ <b>Редактирование события</b>", "", summarizeDraft(draft), "", `<i>${question}</i>`].join("\n");
  }

  /** Сохраняет текущий draft целиком — вызывать только когда draft заведомо полон (все обязательные поля на месте). */
  async function persist(): Promise<void> {
    const completeDraft = draft as CompleteEventDraft;
    await conversation.external(() => eventService.updateSchedule(eventId, user.id, completeDraft, timezone));
  }

  /** Единая точка синхронизации: что бы ни произошло в под-шаге (сохранили или отменили), draft всегда должен отражать реальное состояние в БД. */
  async function reloadDraft(): Promise<void> {
    draft = await conversation.external(loadDraft);
  }

  async function waitYesNo(): Promise<boolean> {
    const res = await waitChoice(conversation, ["edit:confirm:yes", "edit:confirm:no"]);
    return res.kind === "choice" && res.value === "edit:confirm:yes";
  }

  const menuKeyboard = () =>
    new InlineKeyboard()
      .text("📌 Название", "edit:field:name")
      .text("📝 Описание", "edit:field:description")
      .row()
      .text("🔔 Текст напоминаний", "edit:field:reminderText")
      .row()
      .text("🖼 Фото", "edit:field:photo")
      .row()
      .text("🔁 Тип события", "edit:field:kind")
      .row()
      .text("▶️ Дата начала", "edit:field:startDate")
      .text("⏹ Дата окончания", "edit:field:endDate")
      .row()
      .text("⏰ Напоминания", "edit:field:schedule")
      .row()
      .text("✅ Готово", "edit:done");

  // showDetail() сам отвечает на callbackQuery — если передать туда исходный
  // ctx, на который answerCallbackQuery уже вызывался выше, Telegram вернёт
  // ошибку «query is too old». Поэтому в конце используем последний next.
  let exitCtx: Context = ctx;

  while (true) {
    await renderScreen(ctx, chatId, messageId, formText("Что изменить?"), menuKeyboard());

    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (!data) {
      if (next.message) await tryDelete(next);
      continue;
    }

    if (data === "edit:done" || data === "menu:main" || data === "wizard:cancel") {
      exitCtx = next;
      break;
    }

    if (data === "edit:field:name") {
      await next.answerCallbackQuery();
      await editSimpleTextField(
        "Название",
        () => draft.name,
        (v) => {
          draft.name = v;
        },
        (v) => eventService.updateScalarFields(eventId, user.id, { name: v }),
      );
      await reloadDraft();
      continue;
    }

    if (data === "edit:field:description") {
      await next.answerCallbackQuery();
      await editSimpleTextField(
        "Описание",
        () => draft.description,
        (v) => {
          draft.description = v;
        },
        (v) => eventService.updateScalarFields(eventId, user.id, { description: v }),
      );
      await reloadDraft();
      continue;
    }

    if (data === "edit:field:reminderText") {
      await next.answerCallbackQuery();
      await editSimpleTextField(
        "Текст напоминаний",
        () => draft.reminderText,
        (v) => {
          draft.reminderText = v;
        },
        (v) => eventService.updateScalarFields(eventId, user.id, { reminderText: v }),
      );
      await reloadDraft();
      continue;
    }

    if (data === "edit:field:photo") {
      await next.answerCallbackQuery();
      await editPhotoField();
      await reloadDraft();
      continue;
    }

    if (data === "edit:field:kind") {
      await next.answerCallbackQuery();
      const otherKind: EventKind = draft.kind === "once" ? "monthly" : "once";
      const otherLabel = otherKind === "once" ? "разовое" : "ежемесячное";

      await renderScreen(
        ctx,
        chatId,
        messageId,
        formText(
          `Сменить тип события на «${otherLabel}»? Все даты и настройка напоминаний будут стёрты — их нужно будет задать заново.`,
        ),
        new InlineKeyboard().text("✅ Да, сменить", "edit:confirm:yes").text("Отмена", "edit:confirm:no"),
      );

      if (await waitYesNo()) {
        draft.kind = otherKind;
        delete draft.startDate;
        delete draft.endDate;
        delete draft.scheduleType;
        delete draft.customDates;
        delete draft.intervalSchedule;

        const res = await runDateAndScheduleFlow(conversation, ctx, chatId, messageId, formText, draft, {
          start: "",
          end: "",
          schedule: "",
        });
        if (res === "done") await persist();
      }
      await reloadDraft();
      continue;
    }

    if (data === "edit:field:startDate" || data === "edit:field:endDate") {
      await next.answerCallbackQuery();
      await editBoundaryDate(data === "edit:field:startDate" ? "start" : "end");
      await reloadDraft();
      continue;
    }

    if (data === "edit:field:schedule") {
      await next.answerCallbackQuery();
      await editSchedule();
      await reloadDraft();
      continue;
    }

    await answerStaleCallback(next);
  }

  await showDetail(exitCtx, eventId);

  // --- локальные под-шаги (замыкают draft/ctx/persist из внешней области) ---

  /**
   * Общий паттерн для простых текстовых полей: мини-экран с текущим
   * значением (Редактировать/Назад) → ввод нового значения → подтверждение
   * (Подтвердить/Назад) — ничего не сохраняется без явного подтверждения.
   */
  async function editSimpleTextField(
    label: string,
    getCurrent: () => string | undefined,
    setDraft: (value: string) => void,
    persistField: (value: string) => Promise<unknown>,
  ): Promise<void> {
    while (true) {
      const current = getCurrent();
      await renderScreen(
        ctx,
        chatId,
        messageId,
        formText(`Текущее значение — «${label}»: ${current ? escapeHtml(current) : "—"}`),
        new InlineKeyboard().text("✏️ Редактировать", "fieldedit:go").row().text("← Назад", "fieldedit:back"),
      );

      if ((await waitFieldEditGate(conversation)) === "back") return;

      await renderScreen(
        ctx,
        chatId,
        messageId,
        formText(`Введите новое значение — «${label}».`),
        cancelOnlyKeyboard(),
      );
      const res = await waitTextField(conversation, false);
      if (res.kind !== "text") continue;

      await renderScreen(
        ctx,
        chatId,
        messageId,
        formText(`Изменить «${label}» на «${escapeHtml(res.value)}»?`),
        new InlineKeyboard().text("✅ Подтвердить", "edit:confirm:yes").text("← Назад", "edit:confirm:no"),
      );
      if (await waitYesNo()) {
        setDraft(res.value);
        await conversation.external(() => persistField(res.value));
      }
    }
  }

  /** Тот же паттерн, что editSimpleTextField, только приём фото вместо текста. */
  async function editPhotoField(): Promise<void> {
    while (true) {
      const hasPhoto = Boolean(draft.photoFileId);
      await renderScreen(
        ctx,
        chatId,
        messageId,
        formText(`Текущее фото: ${hasPhoto ? "добавлено ✅" : "—"}.`),
        new InlineKeyboard().text("✏️ Изменить фото", "fieldedit:go").row().text("← Назад", "fieldedit:back"),
      );

      if ((await waitFieldEditGate(conversation)) === "back") return;

      await renderScreen(ctx, chatId, messageId, formText("Пришлите новое фото."), cancelOnlyKeyboard());
      const res = await waitPhotoField(conversation);
      if (res.kind !== "photo") continue;

      await renderScreen(
        ctx,
        chatId,
        messageId,
        formText("Сохранить это фото как новое изображение события?"),
        new InlineKeyboard().text("✅ Подтвердить", "edit:confirm:yes").text("← Назад", "edit:confirm:no"),
      );
      if (await waitYesNo()) {
        draft.photoFileId = res.fileId;
        await conversation.external(() =>
          eventService.updateScalarFields(eventId, user.id, { photoFileId: res.fileId }),
        );
      }
    }
  }

  async function editBoundaryDate(which: "start" | "end"): Promise<void> {
    if (!draft.kind || !draft.startDate || !draft.endDate) return; // не должно происходить
    const isStart = which === "start";
    const warning =
      "Если ранее заданные даты/время напоминаний окажутся вне нового диапазона, они больше не будут отправляться.";

    let picked: DatePart | "cancel";
    if (draft.kind === "monthly") {
      const range: CalendarRange = isStart ? { max: draft.endDate } : { min: draft.startDate };
      picked = await pickFixedMonthDate(
        conversation,
        ctx,
        chatId,
        messageId,
        draft.startDate.year,
        draft.startDate.month,
        formText,
        `${warning} Выберите ${isStart ? "дату начала" : "дату окончания"}.`,
        range,
      );
    } else {
      const range: CalendarRange = isStart ? { max: draft.endDate } : { min: draft.startDate };
      picked = await pickCalendarDate(
        conversation,
        ctx,
        chatId,
        messageId,
        formText,
        `${warning} Выберите ${isStart ? "дату начала" : "дату окончания"}.`,
        range,
      );
    }
    if (picked === "cancel") return;

    await renderScreen(
      ctx,
      chatId,
      messageId,
      formText(
        `Изменить ${isStart ? "дату начала" : "дату окончания"} на ${formatDate(picked)}? ${warning}`,
      ),
      new InlineKeyboard().text("✅ Да, изменить", "edit:confirm:yes").text("Отмена", "edit:confirm:no"),
    );
    if (!(await waitYesNo())) return;

    if (isStart) draft.startDate = picked;
    else draft.endDate = picked;

    if (draft.scheduleType === "custom" && draft.customDates && draft.startDate && draft.endDate) {
      const start = draft.startDate;
      const end = draft.endDate;
      draft.customDates = draft.customDates.filter(
        (e) => dateSortKey(e.date) >= dateSortKey(start) && dateSortKey(e.date) <= dateSortKey(end),
      );
    }

    await persist();
  }

  async function editSchedule(): Promise<void> {
    const previousType = draft.scheduleType;
    const fixedMonth =
      draft.kind === "monthly" && draft.startDate ? { year: draft.startDate.year, month: draft.startDate.month } : undefined;

    await renderScreen(
      ctx,
      chatId,
      messageId,
      formText("Выберите режим напоминаний."),
      new InlineKeyboard()
        .text("🗓 Свои даты", "sched:custom")
        .text("🔁 Интервал", "sched:interval")
        .row()
        .text("✖ Отмена", "wizard:cancel"),
    );
    const choice = await waitChoice(conversation, ["sched:custom", "sched:interval"]);
    if (choice.kind === "cancel") return;
    const newType = choice.value === "sched:custom" ? "custom" : "interval";

    if (newType !== previousType) {
      delete draft.customDates;
      delete draft.intervalSchedule;
      draft.scheduleType = newType;
      if (newType === "custom") {
        const res = await runCustomDatesFlow(conversation, ctx, chatId, messageId, formText, draft, fixedMonth);
        if (res !== "cancel") await persist();
      } else {
        const res = await runIntervalFlow(conversation, ctx, chatId, messageId, formText, draft);
        if (res !== "cancel") await persist();
      }
      return;
    }

    // тот же режим, что и был
    if (newType === "custom") {
      await runCustomDatesManageMenu(fixedMonth);
    } else {
      delete draft.intervalSchedule;
      const res = await runIntervalFlow(conversation, ctx, chatId, messageId, formText, draft);
      if (res !== "cancel") await persist();
    }
  }

  async function runCustomDatesManageMenu(fixedMonth: { year: number; month: number } | undefined): Promise<void> {
    while (true) {
      const kb = new InlineKeyboard()
        .text("➕ Добавить новые даты", "custommgmt:add")
        .row()
        .text("🗑 Удалить старые", "custommgmt:delete")
        .row()
        .text("← Назад", "custommgmt:back");

      await renderScreen(ctx, chatId, messageId, formText("Управление своими датами."), kb);

      const next = await conversation.wait();
      const data = next.callbackQuery?.data;
      if (!data) {
        if (next.message) await tryDelete(next);
        continue;
      }

      if (data === "custommgmt:back") {
        await next.answerCallbackQuery();
        return;
      }
      if (data === "custommgmt:add") {
        await next.answerCallbackQuery();
        const res = await runCustomDatesFlow(conversation, ctx, chatId, messageId, formText, draft, fixedMonth);
        // добавленные до этого момента даты уже лежат в draft.customDates — сохраняем, чем бы шаг ни закончился
        await persist();
        if (res === "cancel") return;
        continue;
      }
      if (data === "custommgmt:delete") {
        await next.answerCallbackQuery();
        const res = await runDeleteCustomDatesFlow();
        if (res === "cancel") return;
        continue;
      }

      await answerStaleCallback(next);
    }
  }

  async function runDeleteCustomDatesFlow(): Promise<"done" | "back" | "cancel"> {
    const entries = draft.customDates ?? [];
    if (entries.length === 0) return "back";
    const sorted = [...entries].sort((a, b) => dateSortKey(a.date) - dateSortKey(b.date));
    const selected = new Set<number>();

    while (true) {
      const kb = new InlineKeyboard();
      sorted.forEach((entry, i) => {
        const mark = selected.has(i) ? "✅" : "⬜";
        kb.text(`${mark} ${formatDate(entry.date)}: ${entry.times.join(", ")}`, `del:toggle:${i}`).row();
      });
      kb.text("✅ Готово", "del:done").row();
      kb.text("← Назад", "del:back");

      await renderScreen(ctx, chatId, messageId, formText("Выберите даты, которые хотите удалить."), kb);

      const next = await conversation.wait();
      const data = next.callbackQuery?.data;
      if (!data) {
        if (next.message) await tryDelete(next);
        continue;
      }

      if (isCancel(data)) {
        await next.answerCallbackQuery();
        return "cancel";
      }
      if (data === "del:back") {
        await next.answerCallbackQuery();
        return "back";
      }
      if (data === "del:done") {
        if (selected.size === 0) {
          await next.answerCallbackQuery({ text: "Выберите хотя бы одну дату для удаления.", show_alert: true });
          continue;
        }
        await next.answerCallbackQuery();
        const toRemove = new Set(
          [...selected].map((i) => sorted[i]).filter((e): e is NonNullable<typeof e> => e !== undefined),
        );
        draft.customDates = entries.filter((e) => !toRemove.has(e));
        await persist();
        return "done";
      }
      const match = data.match(/^del:toggle:(\d+)$/);
      if (match) {
        const idx = Number(match[1]);
        if (idx >= 0 && idx < sorted.length) {
          if (selected.has(idx)) selected.delete(idx);
          else selected.add(idx);
        }
        await next.answerCallbackQuery();
        continue;
      }

      await answerStaleCallback(next);
    }
  }
}

/**
 * Гейт мини-экрана правки поля: ждёт «✏️ Редактировать» либо «← Назад».
 * Всё прочее — не тот апдейт: сообщение убираем из чата, чужой callback
 * объясняем алертом и ждём дальше. Общий для текстовых полей и для фото —
 * экран у них разный, а развилка одна и та же.
 */
async function waitFieldEditGate(conversation: MyConversation): Promise<"go" | "back"> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (data === "fieldedit:back" || isCancel(data)) {
      if (data) await next.answerCallbackQuery();
      return "back";
    }
    if (data === "fieldedit:go") {
      await next.answerCallbackQuery();
      return "go";
    }
    await skipUnexpected(next);
  }
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

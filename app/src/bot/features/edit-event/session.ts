import type { InlineKeyboard } from "grammy";
import type { ConversationContext as Context, MyConversation } from "../../context.js";
import { EDIT_CONFIRM } from "../../callback-data/edit.js";
import { renderStep, waitChoice, type WizardScreen } from "../../helpers/steps/index.js";
import { summarizeDraft } from "../../helpers/summarize-draft.js";
import type { CompleteEventDraft, EventDraft } from "../../../types/event.js";
import * as eventService from "../../../modules/event/event.service.js";

/**
 * Состояние одного сеанса редактирования. Раньше всё это было замыканиями
 * внутри одной большой conversation-функции; теперь под-шаги (scalar-fields.ts,
 * boundary-date.ts, schedule.ts, …) — обычные функции, которым сеанс передаётся
 * первым аргументом. Наследует WizardScreen, поэтому годится и как «экран» для
 * общих шагов из helpers/steps/.
 */
export interface EditSession extends WizardScreen {
  eventId: string;
  userId: string;
  /** Текущее состояние события. После каждого под-шага перечитывается из БД (reloadDraft). */
  draft: EventDraft;
  /** Перерисовать экран с живой формой и вопросом. */
  render(question: string, keyboard: InlineKeyboard): Promise<void>;
  /** Сохраняет текущий draft целиком — вызывать только когда draft заведомо полон (все обязательные поля на месте). */
  persist(): Promise<void>;
  /** Единая точка синхронизации: что бы ни произошло в под-шаге (сохранили или отменили), draft всегда должен отражать реальное состояние в БД. */
  reloadDraft(): Promise<void>;
  /** Ждёт ответ на клавиатуру confirmKeyboard; true — только явное «да». */
  waitYesNo(): Promise<boolean>;
}

/** Заголовок живой формы на всех экранах редактирования. */
function editFormText(draft: EventDraft, question: string): string {
  return ["✏️ <b>Редактирование события</b>", "", summarizeDraft(draft), "", `<i>${question}</i>`].join("\n");
}

export async function openEditSession(
  conversation: MyConversation,
  ctx: Context,
  chatId: number,
  messageId: number,
  eventId: string,
  user: { id: string; timezone: string },
): Promise<EditSession> {
  async function loadDraft(): Promise<EventDraft> {
    const event = await eventService.getForUser(eventId, user.id);
    return eventService.toDraftShape(event);
  }

  // DB-вызовы внутри conversation-функции реплеятся при каждом апдейте —
  // conversation.external гарантирует, что побочный эффект случится ровно раз.
  const session: EditSession = {
    conversation,
    ctx,
    chatId,
    messageId,
    eventId,
    userId: user.id,
    draft: await conversation.external(loadDraft),

    formText: (question) => editFormText(session.draft, question),

    render: (question, keyboard) => renderStep(session, question, keyboard),

    persist: async () => {
      const completeDraft = session.draft as CompleteEventDraft;
      await conversation.external(() => eventService.updateSchedule(eventId, user.id, completeDraft, user.timezone));
    },

    reloadDraft: async () => {
      session.draft = await conversation.external(loadDraft);
    },

    waitYesNo: async () => {
      const res = await waitChoice(conversation, [EDIT_CONFIRM.yes, EDIT_CONFIRM.no]);
      return res.kind === "choice" && res.value === EDIT_CONFIRM.yes;
    },
  };

  return session;
}

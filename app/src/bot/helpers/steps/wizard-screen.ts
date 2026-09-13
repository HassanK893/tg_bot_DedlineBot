import type { InlineKeyboard } from "grammy";
import type { ConversationContext as Context, MyConversation } from "../../context.js";
import type { DatePart } from "../../../types/event.js";
import { renderScreen } from "../screen.js";

/**
 * Всё, что нужно любому шагу визарда, чтобы задать вопрос и дождаться ответа.
 * Раньше эти пять значений передавались в каждый шаг отдельными аргументами
 * (conversation, ctx, chatId, messageId, formText) — теперь одним объектом.
 * Собирается один раз в начале диалога (features/create-event.ts,
 * features/edit-event/) и дальше просто прокидывается вниз.
 */
export interface WizardScreen {
  conversation: MyConversation;
  ctx: Context;
  /** Сообщение-экран, которое переписывается на каждом шаге. */
  chatId: number;
  messageId: number;
  /** Живая форма: заголовок + сводка полей + вопрос текущего шага курсивом. */
  formText: (question: string) => string;
}

/** Перерисовать экран: живая форма с новым вопросом + клавиатура шага. */
export async function renderStep(screen: WizardScreen, question: string, keyboard: InlineKeyboard) {
  await renderScreen(screen.ctx, screen.chatId, screen.messageId, screen.formText(question), keyboard);
}

/**
 * «Сегодня» глазами диалога. conversation.now() вместо Date.now() — иначе при
 * реплее диалога (см. комментарий про external в features/create-event.ts)
 * дата пересчитывалась бы заново на каждом апдейте.
 */
export async function todayInConversation(conversation: MyConversation): Promise<DatePart> {
  const nowMs = await conversation.now();
  const now = new Date(nowMs);
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

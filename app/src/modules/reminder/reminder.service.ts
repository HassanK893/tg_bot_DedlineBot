import { escapeHtml } from "../../utils/html.js";
import * as reminderModel from "./reminder.model.js";

/** Создаёт Reminder-строки под уже вычисленные моменты отправки и ставит по джобе на каждую в BullMQ. */
export async function scheduleForEvent(eventId: string, occurrences: Date[]): Promise<number> {
  if (occurrences.length === 0) return 0;
  const created = await reminderModel.createMany(eventId, occurrences);
  for (const reminder of created) {
    const jobId = await reminderModel.enqueueJob(reminder.id, reminder.firesAt);
    await reminderModel.setJobId(reminder.id, jobId);
  }
  return created.length;
}

/** Снимает с очереди все ещё не отправленные напоминания события — используется при паузе/удалении/редактировании. */
export async function cancelPendingForEvent(eventId: string): Promise<void> {
  const pending = await reminderModel.listPendingByEvent(eventId);
  for (const reminder of pending) {
    if (reminder.jobId) await reminderModel.cancelJob(reminder.jobId);
  }
  await reminderModel.deletePendingByEvent(eventId);
}

export async function listUpcomingForEvent(eventId: string, limit = 5) {
  return reminderModel.listUpcomingByEvent(eventId, limit);
}

/** Текст с parse_mode: "HTML" — вызывающая сторона (bot/index.ts) отвечает за сам вызов Telegram API. */
export type SendReminderFn = (chatId: number, html: string, photoFileId?: string) => Promise<void>;

function formatReminderMessage(eventName: string, reminderText: string): string {
  return [
    `🔔 <b>Новое напоминание по событию «${escapeHtml(eventName)}»</b>`,
    "",
    `📝 ${escapeHtml(reminderText)}`,
  ].join("\n");
}

/**
 * Основная логика воркера: срабатывает по джобе из BullMQ, решает — слать ли
 * (событие могло быть поставлено на паузу/удалено между постановкой в
 * очередь и сроком) и отмечает результат в БД.
 */
export async function processReminderJob(reminderId: string, send: SendReminderFn): Promise<void> {
  const reminder = await reminderModel.findByIdWithEvent(reminderId);
  if (!reminder || reminder.status !== "PENDING") return;
  if (reminder.event.state !== "ACTIVE") return;

  try {
    const html = formatReminderMessage(reminder.event.name, reminder.event.reminderText);
    await send(Number(reminder.event.user.telegramId), html, reminder.event.photoFileId ?? undefined);
    await reminderModel.markSent(reminder.id);
  } catch (err) {
    console.error(`[reminder] отправка не удалась (reminder=${reminder.id}):`, err);
    await reminderModel.markFailed(reminder.id);
  }
}

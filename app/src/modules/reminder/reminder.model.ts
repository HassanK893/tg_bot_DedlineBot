import { Queue } from "bullmq";
import prisma from "../../lib/prisma.js";
import redis from "../../lib/redis.js";
import dbFunctionWrapper from "../../utils/dbFunctionWrapper.js";

/**
 * Модель reminder — единственное место, где трогаем и Postgres (таблица
 * Reminder), и Redis (очередь BullMQ). Бизнес-решения (когда планировать,
 * когда снимать) — в reminder.service.ts.
 */

export const REMINDER_QUEUE_NAME = "reminders";
export const reminderQueue = new Queue(REMINDER_QUEUE_NAME, { connection: redis });
// Queue — тоже EventEmitter; без обработчика 'error' необработанная ошибка
// (например, Redis-хиккап) валит весь процесс.
reminderQueue.on("error", (err) => console.error("[reminder-queue] ошибка очереди:", err));

// --- Postgres ---------------------------------------------------------------

export const createMany = dbFunctionWrapper((eventId: string, firesAt: Date[]) =>
  prisma.reminder.createManyAndReturn({
    data: firesAt.map((firesAt) => ({ eventId, firesAt })),
  }),
);

export const setJobId = dbFunctionWrapper((reminderId: string, jobId: string) =>
  prisma.reminder.update({ where: { id: reminderId }, data: { jobId } }),
);

export const findByIdWithEvent = dbFunctionWrapper((reminderId: string) =>
  prisma.reminder.findUnique({
    where: { id: reminderId },
    include: { event: { include: { user: true } } },
  }),
);

export const markSent = dbFunctionWrapper((reminderId: string) =>
  prisma.reminder.update({ where: { id: reminderId }, data: { status: "SENT", sentAt: new Date() } }),
);

export const markFailed = dbFunctionWrapper((reminderId: string) =>
  prisma.reminder.update({ where: { id: reminderId }, data: { status: "FAILED" } }),
);

export const listPendingByEvent = dbFunctionWrapper((eventId: string) =>
  prisma.reminder.findMany({ where: { eventId, status: "PENDING" } }),
);

/**
 * Снятые (пауза/удаление/правка) напоминания просто удаляются, а не
 * помечаются CANCELLED — они не несут пользы после снятия (в интерфейсе
 * нигде не показываются), а при частых паузах/правках строки иначе копятся
 * без ограничения (проверено: 3 цикла пауза→резюм на одном событии — было
 * бы 224 строки вместо 56).
 */
export const deletePendingByEvent = dbFunctionWrapper((eventId: string) =>
  prisma.reminder.deleteMany({ where: { eventId, status: "PENDING" } }),
);

export const listUpcomingByEvent = dbFunctionWrapper((eventId: string, limit: number) =>
  prisma.reminder.findMany({
    where: { eventId, status: "PENDING" },
    orderBy: { firesAt: "asc" },
    take: limit,
  }),
);

// --- Redis / BullMQ -----------------------------------------------------------

export interface ReminderJobData {
  reminderId: string;
}

export async function enqueueJob(reminderId: string, firesAt: Date): Promise<string> {
  const delay = Math.max(0, firesAt.getTime() - Date.now());
  const job = await reminderQueue.add(
    "send-reminder",
    { reminderId } satisfies ReminderJobData,
    { jobId: reminderId, delay, removeOnComplete: true, removeOnFail: 1000 },
  );
  return job.id ?? reminderId;
}

export async function cancelJob(jobId: string): Promise<void> {
  const job = await reminderQueue.getJob(jobId);
  if (!job) return;
  try {
    await job.remove();
  } catch (err) {
    // джоба могла в этот самый момент обрабатываться воркером (гонка при
    // паузе/удалении/правке ровно в момент срабатывания) — BullMQ не даёт
    // удалить активную задачу. Не критично: воркер сам проверяет
    // event.state === "ACTIVE" перед отправкой и не пошлёт сообщение.
    console.error(`[reminder] не удалось снять джобу ${jobId} с очереди:`, err);
  }
}

import { Worker, type Job } from "bullmq";
import redis from "../../lib/redis.js";
import * as reminderService from "./reminder.service.js";
import { REMINDER_QUEUE_NAME, type ReminderJobData } from "./reminder.model.js";
import type { SendReminderFn } from "./reminder.service.js";

/** Запускается из bot/index.ts — воркеру нужен bot.api, поэтому конструктор принимает функцию отправки. */
export function startReminderWorker(send: SendReminderFn): Worker<ReminderJobData> {
  const worker = new Worker<ReminderJobData>(
    REMINDER_QUEUE_NAME,
    async (job: Job<ReminderJobData>) => {
      await reminderService.processReminderJob(job.data.reminderId, send);
    },
    { connection: redis },
  );

  worker.on("failed", (job, err) => {
    console.error(`[reminder-worker] джоба ${job?.id} упала:`, err);
  });
  // Без этого обработчика EventEmitter кидает необработанное исключение и
  // валит весь процесс — BullMQ шлёт сюда, например, гонки по истёкшему
  // локу задачи (Redis-хиккап, рестарт процесса во время обработки и т.п.).
  worker.on("error", (err) => {
    console.error("[reminder-worker] ошибка воркера:", err);
  });

  return worker;
}

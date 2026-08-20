import { Queue, Worker } from "bullmq";
import redis from "../../lib/redis.js";
import * as eventService from "./event.service.js";

const ROLLOVER_QUEUE_NAME = "event-rollover";
const rolloverQueue = new Queue(ROLLOVER_QUEUE_NAME, { connection: redis });
// Queue — тоже EventEmitter; без обработчика 'error' необработанная ошибка валит процесс.
rolloverQueue.on("error", (err) => console.error("[rollover-queue] ошибка очереди:", err));

/**
 * Раз в сутки проверяет, не пора ли ежемесячным событиям перейти в
 * следующий месячный цикл (см. eventService.rolloverDueMonthlyEvents).
 * upsertJobScheduler идемпотентен по jobSchedulerId — повторный вызов при
 * рестарте бота не плодит дубликаты повторяющейся задачи (BullMQ v6 API).
 */
export async function scheduleRolloverChecks(): Promise<void> {
  await rolloverQueue.upsertJobScheduler(
    "daily-rollover-check",
    { pattern: "0 3 * * *" },
    { name: "check", opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}

export function startRolloverWorker(): Worker {
  const worker = new Worker(
    ROLLOVER_QUEUE_NAME,
    async () => {
      const count = await eventService.rolloverDueMonthlyEvents();
      if (count > 0) console.log(`[rollover] перенесено на новый месяц: ${count}`);
    },
    { connection: redis },
  );
  worker.on("failed", (job, err) => console.error(`[rollover-worker] джоба ${job?.id} упала:`, err));
  // Без обработчика 'error' EventEmitter кидает необработанное исключение и
  // валит процесс — см. тот же комментарий в reminder.worker.ts.
  worker.on("error", (err) => console.error("[rollover-worker] ошибка воркера:", err));
  return worker;
}

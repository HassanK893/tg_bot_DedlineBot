import type { Worker } from "bullmq";
import type { Bot } from "./bot/index.js";
import type { SendReminderFn } from "./modules/reminder/reminder.service.js";
import { startReminderWorker } from "./modules/reminder/reminder.worker.js";
import { scheduleRolloverChecks, startRolloverWorker } from "./modules/event/event.rollover.js";
import * as eventService from "./modules/event/event.service.js";

/**
 * Фоновые воркеры: отправка напоминаний и помесячный rollover. Живут не в
 * bot/, потому что к обработке апдейтов отношения не имеют — это отдельные
 * потребители очередей. Но запускаются в том же процессе: воркеру напоминаний
 * нужен bot.api для отправки, и поднимать ради этого второй процесс с
 * собственным подключением к Telegram незачем ни в деве, ни в проде.
 */

export interface BackgroundServices {
  reminderWorker: Worker;
  rolloverWorker: Worker;
}

export function startBackgroundServices(bot: Bot): BackgroundServices {
  const sendReminder: SendReminderFn = async (chatId, html, photoFileId) => {
    if (photoFileId) {
      await bot.api.sendPhoto(chatId, photoFileId, { caption: html, parse_mode: "HTML" });
    } else {
      await bot.api.sendMessage(chatId, html, { parse_mode: "HTML" });
    }
  };

  const reminderWorker = startReminderWorker(sendReminder);

  const rolloverWorker = startRolloverWorker();
  void scheduleRolloverChecks();
  // Разовая проверка на старте: пока процесс лежал, ежемесячные события могли
  // пропустить ночной запуск по расписанию.
  void eventService.rolloverDueMonthlyEvents().catch((err) => {
    console.error("[rollover] стартовая проверка провалилась:", err);
  });

  return { reminderWorker, rolloverWorker };
}

import { Bot, Context, GrammyError, HttpError } from "grammy";
import { conversations, createConversation, type ConversationFlavor } from "@grammyjs/conversations";
import type { Worker } from "bullmq";
import { mainMenuKeyboard, markMainMenuMessage, mainMenuText, staleOldMainMenu } from "./mainMenu.js";
import { INFO_TEXT, TEST_GUIDE_TEXT } from "./help.js";
import { createEventConversation } from "./wizard.js";
import { selectTimezoneConversation } from "./onboarding.js";
import { editEventConversation } from "./editWizard.js";
import * as eventsMenu from "./eventsMenu.js";
import * as userService from "../modules/user/user.service.js";
import { startReminderWorker } from "../modules/reminder/reminder.worker.js";
import type { SendReminderFn } from "../modules/reminder/reminder.service.js";
import { scheduleRolloverChecks, startRolloverWorker } from "../modules/event/event.rollover.js";
import * as eventService from "../modules/event/event.service.js";

export type MyContext = ConversationFlavor<Context>;

/**
 * Вся регистрация хендлеров бота — общая для двух точек входа:
 * bot/index.ts (long polling, локальная разработка) и src/prod.ts
 * (webhook, продакшн). Здесь только middleware/команды/callback'и, без
 * транспорта (polling vs webhook) и без процесс-специфичных вещей
 * (воркеры, setMyCommands) — те остаются в startBackgroundServices/
 * registerBotCommands ниже, вызываются отдельно из каждой точки входа.
 */
export function createBot(token: string): Bot<MyContext> {
  const bot = new Bot<MyContext>(token);

  // --- сырой лог всех апдейтов (только вне продакшна — иначе на реальном
  // сервере в логи бесконечно льются тексты сообщений пользователей) -------

  if (process.env.NODE_ENV !== "production") {
    bot.use(async (ctx, next) => {
      console.log("--- update ---");
      console.dir(ctx.update, { depth: null });
      await next();
    });
  }

  // --- визарды/диалоги -------------------------------------------------------

  bot.use(conversations());
  bot.use(createConversation(createEventConversation, "createEvent"));
  bot.use(createConversation(selectTimezoneConversation, "selectTimezone"));
  bot.use(createConversation(editEventConversation, "editEvent"));

  // --- главное меню + онбординг ------------------------------------------------

  async function sendMainMenu(ctx: Context, name: string): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId !== undefined) await staleOldMainMenu(ctx, chatId);
    const sent = await ctx.reply(mainMenuText(name), { reply_markup: mainMenuKeyboard() });
    if (chatId !== undefined) markMainMenuMessage(chatId, sent.message_id);
  }

  bot.command("start", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const firstName = ctx.from?.first_name ?? "друг";
    const user = await userService.getOrCreateUser(telegramId, firstName);
    if (!user.timezone) {
      await ctx.conversation.enter("selectTimezone");
      return;
    }
    await sendMainMenu(ctx, firstName);
  });

  bot.command("menu", async (ctx) => {
    const name = ctx.from?.first_name ?? "друг";
    await sendMainMenu(ctx, name);
  });

  bot.command("test", async (ctx) => {
    await ctx.reply(TEST_GUIDE_TEXT, { parse_mode: "HTML" });
  });

  bot.command("info", async (ctx) => {
    await ctx.reply(INFO_TEXT, { parse_mode: "HTML" });
  });

  bot.callbackQuery("menu:main", async (ctx) => {
    const name = ctx.from?.first_name ?? "друг";
    await ctx.editMessageText(mainMenuText(name), { reply_markup: mainMenuKeyboard() });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("menu:create", async (ctx) => {
    await ctx.conversation.enter("createEvent");
  });

  bot.callbackQuery("menu:timezone", async (ctx) => {
    await ctx.conversation.enter("selectTimezone");
  });

  // --- «Мои события»: список / карточка / пауза / резюм / удаление / правка --

  bot.callbackQuery("menu:list", async (ctx) => {
    await eventsMenu.showList(ctx);
  });

  bot.callbackQuery(/^event:view:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    if (id) await eventsMenu.showDetail(ctx, id);
    else await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^event:pause:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    if (id) await eventsMenu.pause(ctx, id);
    else await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^event:resume:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    if (id) await eventsMenu.resume(ctx, id);
    else await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^event:delete:confirm:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    if (id) await eventsMenu.confirmDelete(ctx, id);
    else await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^event:delete:do:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    if (id) await eventsMenu.doDelete(ctx, id);
    else await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^event:edit:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    if (!id) {
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.conversation.enter("editEvent", id);
  });

  bot.callbackQuery(/^event:done:confirm:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    if (id) await eventsMenu.confirmDone(ctx, id);
    else await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^event:done:do:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    if (id) await eventsMenu.doDone(ctx, id);
    else await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^event:restore:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    if (id) await eventsMenu.restore(ctx, id);
    else await ctx.answerCallbackQuery();
  });

  // --- текст вне визарда ------------------------------------------------------

  bot.on("message:text", async (ctx) => {
    await ctx.reply("Не понял. Главное меню — /menu");
  });

  return bot;
}

export interface BackgroundServices {
  reminderWorker: Worker;
  rolloverWorker: Worker;
}

/**
 * Воркер напоминаний + воркер помесячного rollover'а + общий обработчик
 * ошибок — общие для обеих точек входа. Воркеру для отправки нужен именно
 * bot.api, поэтому он живёт в том же процессе, что и бот, отдельный процесс
 * тут не оправдан ни в дев, ни в проде.
 */
export function startBackgroundServices(bot: Bot<MyContext>): BackgroundServices {
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
  void eventService.rolloverDueMonthlyEvents().catch((err) => {
    console.error("[rollover] стартовая проверка провалилась:", err);
  });

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error("Telegram отклонил запрос:", e.description);
    } else if (e instanceof HttpError) {
      console.error("Не удалось связаться с Telegram:", e);
    } else {
      console.error("Ошибка обработчика:", e);
    }
  });

  return { reminderWorker, rolloverWorker };
}

/** Список команд для попапа при вводе "/" + кнопка Menu — без этого подсказка при "/" пустая. */
export async function registerBotCommands(bot: Bot<MyContext>): Promise<void> {
  await bot.api.setMyCommands([
    { command: "start", description: "Запуск / главное меню" },
    { command: "menu", description: "Главное меню" },
    { command: "test", description: "Пошаговая инструкция для проверки" },
    { command: "info", description: "Справка по функционалу" },
  ]);
  await bot.api.setChatMenuButton({ menu_button: { type: "commands" } });
}

import { Bot as TelegramBot } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { Context } from "./context.js";
import { errorHandler } from "./handlers/error.js";
import { updateLogger } from "./middlewares/update-logger.js";
import { createEventConversation, createEventFeature } from "./features/create-event.js";
import { editEventConversation, editEventFeature } from "./features/edit-event/index.js";
import { eventsMenuFeature } from "./features/events-menu.js";
import { helpFeature } from "./features/help.js";
import { mainMenuFeature } from "./features/main-menu.js";
import { selectTimezoneConversation, timezoneFeature } from "./features/timezone.js";
import { unhandledFeature } from "./features/unhandled.js";

/**
 * Сборка бота — единственное место, где решается порядок middleware. Сами
 * хендлеры живут в features/ и ничего не знают друг о друге.
 *
 * Здесь только обработка апдейтов: ни транспорта (polling или webhook), ни
 * фоновых воркеров, ни разовых вызовов вроде setMyCommands. Всё это — забота
 * точек входа (src/dev.ts, src/prod.ts), поэтому одна и та же функция годится
 * и для разработки, и для прода.
 */
export function createBot(token: string): TelegramBot<Context> {
  const bot = new TelegramBot<Context>(token);

  bot.catch(errorHandler);

  // Сырой дамп апдейтов — только вне продакшна: на сервере в логи иначе
  // бесконечно льются тексты сообщений пользователей.
  if (process.env.NODE_ENV !== "production") bot.use(updateLogger());

  // --- визарды ---------------------------------------------------------------
  // Регистрируются здесь, а не внутри своих features, из-за порядка: войти в
  // диалог можно только если его middleware уже отработал в этой цепочке. Так,
  // /start (features/main-menu.ts) входит в selectTimezone, объявленный ниже в
  // features/timezone.ts — а сработает это лишь потому, что все три
  // createConversation стоят выше любого хендлера.
  bot.use(conversations());
  bot.use(createConversation(createEventConversation, "createEvent"));
  bot.use(createConversation(selectTimezoneConversation, "selectTimezone"));
  bot.use(createConversation(editEventConversation, "editEvent"));

  // --- хендлеры --------------------------------------------------------------
  bot.use(mainMenuFeature);
  bot.use(helpFeature);
  bot.use(createEventFeature);
  bot.use(timezoneFeature);
  bot.use(editEventFeature);
  bot.use(eventsMenuFeature);

  // Обязательно последним — ловит любое текстовое сообщение.
  bot.use(unhandledFeature);

  return bot;
}

export type Bot = ReturnType<typeof createBot>;

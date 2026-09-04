import "dotenv/config";
import { createBot } from "./bot/index.js";
import { setCommands } from "./bot/handlers/commands/setcommands.js";
import { startBackgroundServices } from "./background.js";

/**
 * Точка входа для локальной разработки: long polling, без Express и без
 * HTTP-сервера. В проде — src/prod.ts (там тот же бот плюс REST API и /healthz).
 */

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN не задан. Вставьте токен тестового бота от @BotFather в app/.env");
}

const bot = createBot(token);
const { reminderWorker, rolloverWorker } = startBackgroundServices(bot);

const stop = () => {
  console.log("Останавливаю бота...");
  void reminderWorker.close();
  void rolloverWorker.close();
  void bot.stop();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await setCommands(bot);

void bot.start({
  onStart: (info) => console.log(`Бот запущен (polling): @${info.username}`),
});

import "dotenv/config";
import { createBot, registerBotCommands, startBackgroundServices } from "./createBot.js";

/** Локальная разработка — long polling, без домена/HTTPS. Продакшн: см. src/prod.ts (webhook). */

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error(
    "BOT_TOKEN не задан. Вставьте токен тестового бота от @BotFather в app/.env",
  );
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

await registerBotCommands(bot);

void bot.start({
  onStart: (info) => console.log(`Бот запущен (polling): @${info.username}`),
});

import "dotenv/config";
import express from "express";
import { createBot } from "./bot/index.js";
import { setCommands } from "./bot/handlers/commands/setcommands.js";
import { startBackgroundServices } from "./background.js";
import mainRouter from "./routes/index.js";
import prisma from "./lib/prisma.js";

/**
 * Продакшн-точка входа. Бот работает на long polling — сам ходит в Telegram за
 * апдейтами, входящие соединения ему не нужны. Поэтому проекту не нужны ни
 * домен, ни TLS-сертификат, ни Nginx перед контейнером.
 *
 * Один процесс: бот + REST API (/api) + воркеры напоминаний и rollover'а.
 * Express тут нужен для /healthz (по нему Docker понимает, жив ли контейнер)
 * и для REST API; наружу он не публикуется — в docker-compose.prod.yml порт
 * проброшен как "127.0.0.1:3000:3000", то есть доступен только с самого
 * сервера.
 *
 * ВАЖНО: Telegram разрешает только один транспорт на токен. Пока прод работает
 * на polling'е, нельзя параллельно запускать локального бота (`npm run bot`) с
 * тем же BOT_TOKEN — они будут выхватывать апдейты друг у друга. Для локальной
 * разработки заведите отдельного бота у @BotFather.
 */

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN не задан — см. .env.production.example");

const port = Number(process.env.PORT ?? 3000);

const bot = createBot(token);
const { reminderWorker, rolloverWorker } = startBackgroundServices(bot);

const app = express();
app.use(express.json());
app.use("/api", mainRouter);

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

// Слушаем 0.0.0.0, а не 127.0.0.1: внутри контейнера loopback свой собственный,
// и до сервера, привязанного к нему, не достучится даже проброс портов Docker.
// Ограничение доступа задаётся не здесь, а в docker-compose.prod.yml.
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`HTTP-сервер слушает 0.0.0.0:${port} (наружу не опубликован)`);
});

// Список команд и кнопка «Меню» — косметика: если Telegram в этот момент
// недоступен, ронять из-за этого приложение незачем.
await setCommands(bot).catch((err) =>
  console.error("[bot] не удалось зарегистрировать список команд:", err),
);

// На случай, если этот бот раньше работал через webhook: Telegram не отдаёт
// апдейты по polling'у, пока webhook не снят. drop_pending_updates не ставим —
// накопившиеся апдейты лучше обработать, чем потерять.
await bot.api.deleteWebhook().catch((err) =>
  console.error("[bot] не удалось снять webhook (возможно, его и не было):", err),
);

// Если polling не поднялся (неверный токен, нет сети, уже запущен другой
// экземпляр с этим же токеном — 409 Conflict), пишем внятную причину и выходим.
// docker-compose перезапустит контейнер: сетевые сбои так вылечатся сами,
// а ошибка конфигурации будет видна в логах.
bot
  .start({ onStart: (info) => console.log(`Бот запущен (polling): @${info.username}`) })
  .catch((err) => {
    console.error("[bot] не удалось запустить polling:", err);
    console.error(
      "Проверьте BOT_TOKEN и что с этим же токеном больше нигде не запущен бот\n" +
        "(см. раздел «Если что-то пошло не так» в DEPLOY.md).",
    );
    process.exit(1);
  });

const stop = () => {
  console.log("Останавливаю приложение...");
  void bot.stop();
  void reminderWorker.close();
  void rolloverWorker.close();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

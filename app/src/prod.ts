import "dotenv/config";
import express from "express";
import { webhookCallback } from "grammy";
import { createBot, registerBotCommands, startBackgroundServices } from "./bot/createBot.js";
import mainRouter from "./routes/index.js";
import prisma from "./lib/prisma.js";

/**
 * Продакшн-точка входа — webhook вместо long polling (нужен домен с HTTPS,
 * см. DEPLOY.md). Один процесс: бот + REST API (/api) + воркеры напоминаний/
 * rollover'а, всё за одним Express-сервером, который в docker-compose.prod.yml
 * слушает только 127.0.0.1 — наружу смотрит Nginx с TLS-терминацией.
 */

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN не задан");

const publicUrl = process.env.PUBLIC_URL;
if (!publicUrl) throw new Error("PUBLIC_URL не задан (например https://skanix.ru) — нужен для регистрации webhook");

const webhookSecret = process.env.WEBHOOK_SECRET;
if (!webhookSecret) throw new Error("WEBHOOK_SECRET не задан — см. .env.example.production");

const port = Number(process.env.PORT ?? 3000);

const bot = createBot(token);
const { reminderWorker, rolloverWorker } = startBackgroundServices(bot);

const app = express();
app.use(express.json());

// Секретный путь + secret_token — оба вместе, чтобы посторонний POST на этот
// адрес не мог притвориться апдейтом от Telegram.
const webhookPath = `/telegram/webhook/${webhookSecret}`;
app.post(webhookPath, webhookCallback(bot, "express", { secretToken: webhookSecret }));

app.use("/api", mainRouter);

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`prod-сервер слушает 127.0.0.1:${port}`);
});

await registerBotCommands(bot);
await bot.api.setWebhook(`${publicUrl}${webhookPath}`, { secret_token: webhookSecret });
console.log(`Webhook установлен: ${publicUrl}${webhookPath.replace(webhookSecret, "***")}`);

const stop = () => {
  console.log("Останавливаю сервер...");
  void reminderWorker.close();
  void rolloverWorker.close();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

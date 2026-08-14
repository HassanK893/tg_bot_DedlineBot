import "dotenv/config";
import { Bot, Context, InlineKeyboard, GrammyError, HttpError } from "grammy";
import { conversations, createConversation, type ConversationFlavor } from "@grammyjs/conversations";
import { mainMenuKeyboard, mainMenuText } from "./mainMenu.js";
import { createEventConversation } from "./wizard.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error(
    "BOT_TOKEN не задан. Вставьте токен тестового бота от @BotFather в app/.env",
  );
}

type MyContext = ConversationFlavor<Context>;

const bot = new Bot<MyContext>(token);

// --- сырой лог всех апдейтов -------------------------------------------------

bot.use(async (ctx, next) => {
  console.log("--- update ---");
  console.dir(ctx.update, { depth: null });
  await next();
});

// --- визард создания события --------------------------------------------

bot.use(conversations());
bot.use(createConversation(createEventConversation, "createEvent"));

// --- главное меню --------------------------------------------------------

bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name ?? "друг";
  await ctx.reply(mainMenuText(name), { reply_markup: mainMenuKeyboard() });
});

bot.command("menu", async (ctx) => {
  const name = ctx.from?.first_name ?? "друг";
  await ctx.reply(mainMenuText(name), { reply_markup: mainMenuKeyboard() });
});

bot.callbackQuery("menu:main", async (ctx) => {
  const name = ctx.from?.first_name ?? "друг";
  await ctx.editMessageText(mainMenuText(name), { reply_markup: mainMenuKeyboard() });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("menu:list", async (ctx) => {
  await ctx.editMessageText(
    "Событий пока нет.\n\nСоздайте первое через «Создать событие».",
    { reply_markup: new InlineKeyboard().text("← Назад", "menu:main") },
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("menu:create", async (ctx) => {
  await ctx.conversation.enter("createEvent");
});

// --- текст вне визарда ------------------------------------------------------

bot.on("message:text", async (ctx) => {
  await ctx.reply("Не понял. Главное меню — /menu");
});

// --- ошибки и запуск ---------------------------------------------------------

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

const stop = () => {
  console.log("Останавливаю бота...");
  void bot.stop();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

void bot.start({
  onStart: (info) => console.log(`Бот запущен: @${info.username}`),
});

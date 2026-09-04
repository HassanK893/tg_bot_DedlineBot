import { Composer } from "grammy";
import type { Context } from "../context.js";

const composer = new Composer<Context>();

/**
 * Текст, набранный вне визарда, — подключать ТОЛЬКО последним: этот хендлер
 * ловит любое сообщение, и всё, что зарегистрировано после него, до апдейтов
 * уже не доберётся.
 */
composer.on("message:text", async (ctx) => {
  await ctx.reply("Не понял. Главное меню — /menu");
});

export { composer as unhandledFeature };

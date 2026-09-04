import type { Middleware } from "grammy";
import type { Context } from "../context.js";

/**
 * Сырой дамп каждого апдейта — незаменим при отладке визардов, но в проде
 * лить в логи тексты сообщений пользователей нельзя. Поэтому подключается
 * в index.ts только вне продакшна.
 */
export function updateLogger(): Middleware<Context> {
  return async (ctx, next) => {
    console.log("--- update ---");
    console.dir(ctx.update, { depth: null });
    await next();
  };
}

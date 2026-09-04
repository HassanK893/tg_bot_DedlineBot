import { GrammyError, HttpError, type ErrorHandler } from "grammy";
import type { Context } from "../context.js";

/**
 * Последний рубеж: сюда попадает всё, что не поймали сами хендлеры. Три вида
 * ошибок разделены намеренно — по логам сразу видно, отклонил ли запрос сам
 * Telegram (наша ошибка в данных), не дошли ли мы до него (сеть) или упал наш
 * собственный код.
 */
export const errorHandler: ErrorHandler<Context> = (err) => {
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Telegram отклонил запрос:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Не удалось связаться с Telegram:", e);
  } else {
    console.error("Ошибка обработчика:", e);
  }
};

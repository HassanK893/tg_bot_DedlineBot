import prisma from "../../lib/prisma.js";
import dbFunctionWrapper from "../../utils/dbFunctionWrapper.js";

/**
 * Модель = единственное место, где модуль user трогает БД. Никакой бизнес-
 * логики тут — только Prisma-запросы, обёрнутые dbFunctionWrapper (маппинг
 * ошибок Prisma в AppError).
 */

export const findByTelegramId = dbFunctionWrapper((telegramId: bigint) =>
  prisma.user.findUnique({ where: { telegramId } }),
);

export const findById = dbFunctionWrapper((id: string) => prisma.user.findUnique({ where: { id } }));

export const createUser = dbFunctionWrapper((telegramId: bigint, firstName: string) =>
  prisma.user.create({ data: { telegramId, firstName } }),
);

export const updateTimezoneByTelegramId = dbFunctionWrapper((telegramId: bigint, timezone: string) =>
  prisma.user.update({ where: { telegramId }, data: { timezone } }),
);

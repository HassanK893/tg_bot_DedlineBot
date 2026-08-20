import type { User } from "../../generated/prisma/client.js";
import { NotFound } from "../../middleware/generalMiddleware/errorMessage.js";
import * as userModel from "./user.model.js";

/** Используется ботом на каждом /start — создаёт пользователя при первом обращении. */
export async function getOrCreateUser(telegramId: number, firstName: string): Promise<User> {
  const id = BigInt(telegramId);
  const existing = await userModel.findByTelegramId(id);
  if (existing) return existing;
  return userModel.createUser(id, firstName);
}

export async function getByTelegramId(telegramId: number): Promise<User> {
  const user = await userModel.findByTelegramId(BigInt(telegramId));
  if (!user) throw new NotFound("Пользователь не найден");
  return user;
}

export async function getById(id: string): Promise<User> {
  const user = await userModel.findById(id);
  if (!user) throw new NotFound("Пользователь не найден");
  return user;
}

export async function setTimezone(telegramId: number, timezone: string): Promise<User> {
  return userModel.updateTimezoneByTelegramId(BigInt(telegramId), timezone);
}

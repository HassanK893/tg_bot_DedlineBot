import type { Request } from "express";
import { BadRequest } from "../middleware/generalMiddleware/errorMessage.js";

/** Express 5 типизирует req.params как string | string[] (репитабельные сегменты) — почти всегда нам нужен просто string. */
export function getParam(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Достаёт и валидирует обязательные параметры пути — общие для всех
 * контроллеров, чтобы одна и та же проверка не расходилась по формулировкам
 * ошибки от модуля к модулю.
 */
export function requireTelegramId(req: Request): number {
  const raw = getParam(req.params, "telegramId");
  const telegramId = Number(raw);
  if (!raw || !Number.isFinite(telegramId)) throw new BadRequest("telegramId обязателен и должен быть числом");
  return telegramId;
}

export function requireEventId(req: Request): string {
  const eventId = getParam(req.params, "eventId");
  if (!eventId) throw new BadRequest("eventId обязателен");
  return eventId;
}

import { Request, Response } from "express";
import type { User } from "../../generated/prisma/client.js";
import { BadRequest } from "../../middleware/generalMiddleware/errorMessage.js";
import { OkSuccess } from "../../middleware/generalMiddleware/succesMessege.js";
import { requireTelegramId } from "../../utils/params.js";
import * as userService from "./user.service.js";

/** telegramId — bigint в БД, JSON.stringify падает на bigint напрямую. */
function toDto(user: User) {
  return { ...user, telegramId: user.telegramId.toString() };
}

export async function getByTelegramId(req: Request, res: Response) {
  const user = await userService.getByTelegramId(requireTelegramId(req));
  new OkSuccess(res, toDto(user));
}

export async function updateTimezone(req: Request, res: Response) {
  const telegramId = requireTelegramId(req);
  const { timezone } = req.body as { timezone?: string };
  if (!timezone) throw new BadRequest("timezone обязателен");
  const user = await userService.setTimezone(telegramId, timezone);
  new OkSuccess(res, toDto(user), "Часовой пояс обновлён");
}

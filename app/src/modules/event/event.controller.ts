import { Request, Response } from "express";
import type { CompleteEventDraft } from "../../types/event.js";
import { BadRequest } from "../../middleware/generalMiddleware/errorMessage.js";
import { CreatedSuccess, NoContentSuccess, OkSuccess } from "../../middleware/generalMiddleware/succesMessege.js";
import { getParam } from "../../utils/params.js";
import * as userService from "../user/user.service.js";
import * as eventService from "./event.service.js";

async function resolveUser(req: Request) {
  const raw = getParam(req.params, "telegramId");
  const telegramId = Number(raw);
  if (!raw || !Number.isFinite(telegramId)) throw new BadRequest("telegramId обязателен");
  return userService.getByTelegramId(telegramId);
}

function requireEventId(req: Request): string {
  const eventId = getParam(req.params, "eventId");
  if (!eventId) throw new BadRequest("eventId обязателен");
  return eventId;
}

function requireTimezone(timezone: string | null): string {
  if (!timezone) throw new BadRequest("У пользователя не задан часовой пояс — пройдите онбординг в боте");
  return timezone;
}

export async function create(req: Request, res: Response) {
  const user = await resolveUser(req);
  const timezone = requireTimezone(user.timezone);
  const draft = req.body as CompleteEventDraft;
  const { event, scheduledCount } = await eventService.createEvent(user.id, draft, timezone);
  new CreatedSuccess(res, { event, scheduledCount });
}

export async function list(req: Request, res: Response) {
  const user = await resolveUser(req);
  const events = await eventService.listByUser(user.id);
  new OkSuccess(res, events);
}

export async function getOne(req: Request, res: Response) {
  const user = await resolveUser(req);
  const event = await eventService.getForUser(requireEventId(req), user.id);
  new OkSuccess(res, event);
}

export async function pause(req: Request, res: Response) {
  const user = await resolveUser(req);
  await eventService.pauseEvent(requireEventId(req), user.id);
  new OkSuccess(res, null, "Событие поставлено на паузу");
}

export async function resume(req: Request, res: Response) {
  const user = await resolveUser(req);
  const timezone = requireTimezone(user.timezone);
  await eventService.resumeEvent(requireEventId(req), user.id, timezone);
  new OkSuccess(res, null, "Событие возобновлено");
}

export async function remove(req: Request, res: Response) {
  const user = await resolveUser(req);
  await eventService.deleteEvent(requireEventId(req), user.id);
  new NoContentSuccess(res, null);
}

export async function updateFields(req: Request, res: Response) {
  const user = await resolveUser(req);
  const event = await eventService.updateScalarFields(requireEventId(req), user.id, req.body);
  new OkSuccess(res, event);
}

export async function updateSchedule(req: Request, res: Response) {
  const user = await resolveUser(req);
  const timezone = requireTimezone(user.timezone);
  const draft = req.body as CompleteEventDraft;
  const event = await eventService.updateSchedule(requireEventId(req), user.id, draft, timezone);
  new OkSuccess(res, event);
}

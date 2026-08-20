import { Request, Response } from "express";
import { BadRequest } from "../../middleware/generalMiddleware/errorMessage.js";
import { OkSuccess } from "../../middleware/generalMiddleware/succesMessege.js";
import { getParam } from "../../utils/params.js";
import * as reminderService from "./reminder.service.js";

export async function listUpcoming(req: Request, res: Response) {
  const eventId = getParam(req.params, "eventId");
  if (!eventId) throw new BadRequest("eventId обязателен");
  const reminders = await reminderService.listUpcomingForEvent(eventId, 20);
  new OkSuccess(res, reminders);
}

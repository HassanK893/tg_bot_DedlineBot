import { Request, Response } from "express";
import { OkSuccess } from "../../middleware/generalMiddleware/succesMessege.js";
import { requireEventId } from "../../utils/params.js";
import * as reminderService from "./reminder.service.js";

export async function listUpcoming(req: Request, res: Response) {
  const reminders = await reminderService.listUpcomingForEvent(requireEventId(req), 20);
  new OkSuccess(res, reminders);
}

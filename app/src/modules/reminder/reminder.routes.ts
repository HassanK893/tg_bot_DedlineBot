import { Router } from "express";
import { functionWrapper } from "../../utils/functionWrapper.js";
import * as reminderController from "./reminder.controller.js";

const reminderRouter = Router({ mergeParams: true });

reminderRouter.get("/events/:eventId/reminders", functionWrapper(reminderController.listUpcoming));

export default reminderRouter;

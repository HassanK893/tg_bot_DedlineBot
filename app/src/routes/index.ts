import { Router } from "express";
import userRouter from "../modules/user/user.routes.js";
import reminderRouter from "../modules/reminder/reminder.routes.js";

const mainRouter = Router({ mergeParams: true });

mainRouter.use("/users", userRouter);
// reminderRouter сам содержит полный путь /events/:eventId/reminders —
// вложенность отличается от userRouter, т.к. напоминания не требуют telegramId.
mainRouter.use("/", reminderRouter);

export default mainRouter;

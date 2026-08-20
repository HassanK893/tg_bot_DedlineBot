import { Router } from "express";
import { functionWrapper } from "../../utils/functionWrapper.js";
import * as userController from "./user.controller.js";
import eventRouter from "../event/event.routes.js";

const userRouter = Router({ mergeParams: true });

userRouter.get("/:telegramId", functionWrapper(userController.getByTelegramId));
userRouter.patch("/:telegramId/timezone", functionWrapper(userController.updateTimezone));
userRouter.use("/:telegramId/events", eventRouter);

export default userRouter;

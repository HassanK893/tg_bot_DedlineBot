import { Router } from "express";
import { functionWrapper } from "../../utils/functionWrapper.js";
import validateBody from "../../utils/validateBody.js";
import * as eventController from "./event.controller.js";
import { completeEventDraftSchema, updateScalarFieldsSchema } from "./event.schemas.js";

const eventRouter = Router({ mergeParams: true });

eventRouter.post("/", validateBody(completeEventDraftSchema), functionWrapper(eventController.create));
eventRouter.get("/", functionWrapper(eventController.list));
eventRouter.get("/:eventId", functionWrapper(eventController.getOne));
eventRouter.patch("/:eventId", validateBody(updateScalarFieldsSchema), functionWrapper(eventController.updateFields));
eventRouter.put(
  "/:eventId/schedule",
  validateBody(completeEventDraftSchema),
  functionWrapper(eventController.updateSchedule),
);
eventRouter.post("/:eventId/pause", functionWrapper(eventController.pause));
eventRouter.post("/:eventId/resume", functionWrapper(eventController.resume));
eventRouter.delete("/:eventId", functionWrapper(eventController.remove));

export default eventRouter;

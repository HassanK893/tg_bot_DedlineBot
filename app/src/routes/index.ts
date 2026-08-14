import { Response, Request, Router } from "express";
import { functionWrapper } from "../utils/functionWrapper.js";

const mainRouter = Router({ mergeParams: true });
// const authController = new AuthController();
// mainRouter.post(
//   "/authefication",
//   functionWrapper(authController.authentication),
// );
// mainRouter.use("/scan", scanRouter);

export default mainRouter;

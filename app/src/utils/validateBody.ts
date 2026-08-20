import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";
import { ResponseErrorJsonMessage } from "../types/Response.js";

const validateBody =
  <T>(sheme: ZodType<T>) =>
  (
    req: Request,
    res: Response<ResponseErrorJsonMessage>,
    next: NextFunction,
  ) => {
    const result = sheme.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        code: "invalid_data",
        statusCode: 400,
        message: "ошибка с телом запроса",
        name: "BadRequest",
      });
      return;
    }
    req.body = result.data;
    next();
  };

export default validateBody;

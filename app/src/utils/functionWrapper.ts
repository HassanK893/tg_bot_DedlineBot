import { NextFunction, Request, Response } from "express";
import { ResponseErrorJsonMessage } from "../types/Response.js";
import { AppError } from "../middleware/generalMiddleware/errorMessage.js";

export const functionWrapper =
  <RequestParams = unknown, ResponseBody = unknown, RequestBody = unknown>(
    fn: (
      req: Request<RequestParams, ResponseBody, RequestBody>,
      res: Response<ResponseBody | ResponseErrorJsonMessage>,
      next: NextFunction,
    ) => void | Response | Promise<void | Response>,
  ) =>
  async (
    req: Request<RequestParams, ResponseBody, RequestBody>,
    res: Response<ResponseBody | ResponseErrorJsonMessage>,
    next: NextFunction,
  ) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          name: error.name,
          code: error.code,
          statusCode: error.statusCode,
          message: error.message,
        });
      }

      return res.status(500).json({
        name: "InternalServerError",
        code: "internal_error",
        statusCode: 500,
        message: "Внутренняя ошибка сервера",
      });
    }
  };

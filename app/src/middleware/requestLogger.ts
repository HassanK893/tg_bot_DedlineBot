import { Request, Response } from "express";
import requestHttpData from "../types/requestHttpData.js";
import { ResponseErrorJsonMessage } from "../types/Response.js";
import { BadRequest } from "./generalMiddleware/errorMessage.js";

const createLogString = (userInfo: requestHttpData): string => {
  let result = "";
  for (const key in userInfo) {
    result += ` ${String(userInfo[key as keyof requestHttpData])}`;
  }
  return result;
};

const requestLogger = (
  request: Request,
  response: Response<ResponseErrorJsonMessage>,
  next: () => void,
): Response<ResponseErrorJsonMessage> | void => {
  const httpRequestInfo: requestHttpData = {
    userIp: request.ip,
    originalUrl: request.originalUrl,
    method: request.method,
  };

  if (
    !httpRequestInfo ||
    !httpRequestInfo.originalUrl ||
    !httpRequestInfo.method
  ) {
    return response
      .status(404)
      .json({
      
        message: "Ваших http методов не сушествует",
        code: "not_exist",
        statusCode: 404,
        name: "BadRequest",
      });
  }
  console.log(`Данные о запросе юзера: ${createLogString(httpRequestInfo)}`);
  next();
};

export default requestLogger;

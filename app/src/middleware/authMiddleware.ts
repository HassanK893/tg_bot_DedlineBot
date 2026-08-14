import { NextFunction, Request, Response } from "express";
import { verifyJwt } from "../lib/jwt.js";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const token = req.headers.authorization?.split(" ")[1];
  console.log(token);
  const jwt = verifyJwt(token);


  req.user = {userId:jwt.sub}

  next();
};

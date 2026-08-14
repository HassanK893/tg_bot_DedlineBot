import jwt from "jsonwebtoken";
import {
  BadRequest,
  Unauthorized,
} from "../middleware/generalMiddleware/errorMessage.js";

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY!;

export function singJwt(userId: string): string {
  try {
    const token = jwt.sign({ sub: userId }, JWT_SECRET_KEY, {
      expiresIn: "15m",
    });
    return token;
  } catch (error) {
    throw new Unauthorized("Невалидный токен", "invalid_token");
  }
}

export function verifyJwt(token: string | undefined) {
  try {
    if (!token) {
      throw new Unauthorized("Токен отсутствует", "no_token");
    }
    return jwt.verify(token, JWT_SECRET_KEY) as { sub: string };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Unauthorized("Токен истёк", "token_expired");
    }
    throw new Unauthorized("Невалидный токен", "invalid_token");
  }
}

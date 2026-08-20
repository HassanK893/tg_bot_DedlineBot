import { Prisma } from "../generated/prisma/client.js";
import { BadRequest, InternalServerError, NotFound } from "../middleware/generalMiddleware/errorMessage.js";

const dbFunctionWrapper =
  <T extends unknown[], R>(fn: (...args: T) => Promise<R>) =>
  async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        switch (err.code) {
          case "P2002":
            throw new BadRequest(
              `запись с таким уникальным полем уже существует`,
            );
          case "P2003":
            throw new NotFound(`пользователь не найден`);
          case "P2000":
            throw new BadRequest(`одно из полей слишком длинное`);
          case "P2025":
            throw new NotFound(`запись не найдена`);
          default:
            throw new InternalServerError(`ошибка БД (${err.code})`);
        }
      }
      throw new InternalServerError(`ошибка БД (${err})`);
    }
  };

export default dbFunctionWrapper;

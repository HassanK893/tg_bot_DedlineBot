import { User } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      userInfo?: {
        userIp: string | undefined;
        originalUrl: string;
        method: string;
      };
      user?: {
        userId: string;
        fullUser?: User;
      };
    }
  }
}

export {};

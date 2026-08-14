import type { FileArray, UploadedFile } from "express-fileupload";
import type { ScanEXTS } from "../modules/scan/types/Scan.js";
import { Scan, User } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      userInfo?: {
        userIp: string | undefined;
        originalUrl: string;
        method: string;
      };
      scan?: Scan;
      user?: {
        userId: string;
        fullUser?: User;
      };
      files?: FileArray | null | undefined;
      uploadedFile?: {
        file: UploadedFile;
        ext: ScanEXTS;
      };
    }
  }
}

export {};

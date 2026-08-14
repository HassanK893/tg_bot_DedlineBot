import express, { Application } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import IServerSettingsEnv from "./types/env.js";
import getEnv from "./config/env.js";
import mainRouter from "./routes/index.js";
import validateRequestData from "./middleware/validateRequestData.js";
import requestLogger from "./middleware/requestLogger.js";
import { PrismaClient } from "./generated/prisma/client.js";
import prisma from "./lib/prisma.js";
// import { ensureBucket } from "./lib/s3.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class Server {
  server: Application = express();
  env: IServerSettingsEnv;

  constructor(serverSettingsEnv: IServerSettingsEnv) {
    this.env = serverSettingsEnv;
    this.setupMiddleware();
    this.createMainRouter();
  }

  private setupMiddleware() {
    this.server.use(express.json());
    this.server.use(cors());
    this.server.use(
      "/uploads",
      express.static(path.join(__dirname, "../uploads")),
    );
  }
  private createMainRouter() {
    this.server.use(validateRequestData);
    this.server.use(requestLogger);
    this.server.use("/api", mainRouter);
  }


  async start() {
    // await ensureBucket();
    const server = this.server
      .listen(this.env.PORT, () => {
        console.log(`подключение к порту ${this.env.PORT} прошло успешно`);
      })
      .on("error", (err: unknown) => {
        console.error(
          `ошибка ${err} на порту ${this.env.PORT}, возможно занят`,
        );
        process.exit(1);
      });

    this.setupGracefulShutdown(server); 
  }

  private setupGracefulShutdown(server: import("http").Server) {
    const serverDeath = async () => {
      server.close(async (err) => {
        if (err) process.exit(1);
      });
      try {
        await prisma.$disconnect();
        process.exit(0);
      } catch (err) {
        console.error(`ошибка при закрытии сервера ${err}`);
        process.exit(1);
      }
    };

    process.on("SIGTERM", serverDeath);
    process.on("SIGINT", serverDeath);
  }
}

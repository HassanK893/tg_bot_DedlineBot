import "dotenv/config";
import Server from "./server.js";
import serverSettingsEnv from "./config/env.js";
function run() {
  const server = new Server(serverSettingsEnv);
  server.start().catch((err) => {
    console.error("[start] запуск провалился:", err);
    process.exit(1);
  });
}

run();

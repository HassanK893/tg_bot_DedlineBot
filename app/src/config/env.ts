import IServerSettingsEnv from "../types/env.js";
import logEnvVariable from "../utils/logger/env-logger.js"

function getEnv() {

    logEnvVariable(process.env.PORT, "PORT");
    const env: IServerSettingsEnv = {
      PORT: +(process.env.PORT || 80),
    };
    return env;
 
}
const serverSettingsEnv = getEnv();
export default serverSettingsEnv;

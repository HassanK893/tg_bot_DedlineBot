import IORedis from "ioredis";

/** maxRetriesPerRequest: null — обязательное требование BullMQ для соединений очереди/воркера. */
const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// ioredis сам переподключается при обрывах, но без слушателя 'error'
// EventEmitter всё равно кидает необработанное исключение и валит процесс.
redis.on("error", (err) => console.error("[redis] ошибка соединения:", err));

export default redis;

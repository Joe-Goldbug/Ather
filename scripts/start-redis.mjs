import { RedisMemoryServer } from 'redis-memory-server';

(async () => {
  const redisServer = new RedisMemoryServer({
    instance: {
      port: 6379
    }
  });
  await redisServer.start();
  const host = await redisServer.getHost();
  const port = await redisServer.getPort();
  console.log(`Redis server is running at ${host}:${port}`);
})();

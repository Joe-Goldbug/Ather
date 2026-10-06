import { RedisMemoryServer } from 'redis-memory-server';

const redisServer = new RedisMemoryServer({
  instance: { port: 6379 },
});

await redisServer.start();
console.log('Redis server is running at 127.0.0.1:6379');

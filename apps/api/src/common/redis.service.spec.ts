import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  let service: RedisService;
  let redisClientMock: any;

  beforeEach(async () => {
    redisClientMock = {
      ping: (jest.fn() as any).mockResolvedValue('PONG'),
      set: (jest.fn() as any).mockResolvedValue('OK'),
      get: (jest.fn() as any).mockResolvedValue('mock-value'),
      del: (jest.fn() as any).mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: 'REDIS_CLIENT',
          useValue: redisClientMock,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('pings Redis for dependency readiness checks', async () => {
    await expect(service.ping()).resolves.toBe('PONG');
    expect(redisClientMock.ping).toHaveBeenCalledTimes(1);
  });

  describe('set', () => {
    it('should call redis set method with correct parameters', async () => {
      await service.set('test-key', 'test-value', 60);
      expect(redisClientMock.set).toHaveBeenCalledWith('test-key', 'test-value', 'EX', 60);
    });

    it('should call redis set method without expiry if not provided', async () => {
      await service.set('test-key', 'test-value');
      expect(redisClientMock.set).toHaveBeenCalledWith('test-key', 'test-value');
    });
  });

  describe('get', () => {
    it('should call redis get method and return the value', async () => {
      const result = await service.get('test-key');
      expect(redisClientMock.get).toHaveBeenCalledWith('test-key');
      expect(result).toBe('mock-value');
    });
  });

  describe('del', () => {
    it('should call redis del method and return the number of deleted keys', async () => {
      const result = await service.del('test-key');
      expect(redisClientMock.del).toHaveBeenCalledWith('test-key');
      expect(result).toBe(1);
    });
  });

  it('atomically consumes only the matching structured OTP', async () => {
    redisClientMock.eval = (jest.fn() as any).mockResolvedValue('123456:user-old');
    await expect(service.consumeIfMatches('otp:test@example.com', '123456')).resolves.toBe('123456:user-old');
    expect(redisClientMock.eval).toHaveBeenCalledWith(expect.stringContaining('redis.call'), 1, 'otp:test@example.com', '123456');
  });

  it('issues the OTP and rate limit in one Redis script', async () => {
    redisClientMock.eval = (jest.fn() as any).mockResolvedValue(1);
    await expect(service.issueOtp('otp:test@example.com', 'rate_limit:otp:test@example.com', '123456:user-id')).resolves.toBe(true);
    expect(redisClientMock.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('SET'"), 2,
      'otp:test@example.com', 'rate_limit:otp:test@example.com', '123456:user-id');
  });
});

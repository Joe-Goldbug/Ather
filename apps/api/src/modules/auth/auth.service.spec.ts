import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { AuthService } from './auth.service.js';
import { Database } from '../../common/database.js';
import { RedisService } from '../../common/redis.service.js';
import { Resend } from 'resend';
import { UnauthorizedException } from '@nestjs/common';

// Mock dependencies
jest.mock('resend');
jest.mock('@react-email/render', () => ({
  render: jest.fn(async () => '<html>EVA</html>'),
}));

describe('AuthService', () => {
  let service: AuthService;
  let db: Database;
  let redis: RedisService;
  let resendMock: jest.Mocked<Resend>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: Database,
          useValue: {
            pool: {
              query: jest.fn(),
              connect: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            issueOtp: jest.fn(),
            consumeIfMatches: jest.fn(),
          },
        },
        {
          provide: 'RESEND_CLIENT',
          useValue: {
            emails: {
              send: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    db = module.get<Database>(Database);
    redis = module.get<RedisService>(RedisService);
    resendMock = module.get('RESEND_CLIENT');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateOTP', () => {
    it('should generate a 6-digit OTP', () => {
      const otp = service.generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });
  });

  describe('getUserByEmail', () => {
    it('queries the email column rather than treating an email as a UUID', async () => {
      (db.pool.query as any).mockResolvedValueOnce({ rows: [] });

      await service.getUserByEmail('person@example.com');

      expect(db.pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE email = $1'),
        ['person@example.com'],
      );
      expect(db.pool.query).toHaveBeenCalledWith(
        expect.stringContaining('deletion_requested_at IS NULL'),
        ['person@example.com'],
      );
    });
  });

  describe('validateToken', () => {
    it('does not authenticate an account while deletion is pending', async () => {
      (db.pool.query as any).mockResolvedValueOnce({ rows: [] });

      await service.validateToken('session-token');

      expect(db.pool.query).toHaveBeenCalledWith(
        expect.stringContaining('u.deletion_requested_at IS NULL'),
        ['session-token'],
      );
    });

    it('can validate only for an explicit pending-deletion retry', async () => {
      (db.pool.query as any).mockResolvedValueOnce({ rows: [{ id: 'user-1' }] });

      await service.validateToken('session-token', { includeDeleting: true });

      const sql = (db.pool.query as any).mock.calls[0][0] as string;
      expect(sql).not.toContain('u.deletion_requested_at IS NULL');
    });
  });

  describe('sendOTP', () => {
    it('should block if requested too frequently (rate limiting)', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] } as never), release: jest.fn() };
      (db.pool.connect as any).mockResolvedValue(client);
      (redis.issueOtp as any).mockResolvedValueOnce(false);
      
      await expect(service.sendOTP('test@example.com')).rejects.toThrow(
        'Please wait before requesting a new OTP'
      );
    });

    it('should generate OTP, save to Redis and send email', async () => {
      const client = { query: jest.fn(async (sql: string) => ({ rows: sql.includes('FROM users') ? [{ id: 'user-id' }] : [] })), release: jest.fn() };
      (db.pool.connect as any).mockResolvedValue(client);
      (redis.issueOtp as any).mockResolvedValueOnce(true);
      
      (resendMock.emails.send as any).mockImplementationOnce(async () => {
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        return { data: { id: 'msg_123' }, error: null };
      });

      const previousApiKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-key';
      try {
        await service.sendOTP('test@example.com');
      } finally {
        if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = previousApiKey;
      }

      expect(redis.issueOtp).toHaveBeenCalledWith(
        'otp:test@example.com',
        'rate_limit:otp:test@example.com',
        expect.stringMatching(/^\d{6}:user-id$/),
      );
      expect(redis.set).not.toHaveBeenCalled();
      expect(resendMock.emails.send).toHaveBeenCalled();
      expect(client.query.mock.calls.findIndex(([sql]) => sql === 'COMMIT')).toBeGreaterThan(0);
    });

    it('does not send email and clears issued keys when DB commit fails', async () => {
      const client = { query: jest.fn(async (sql: string) => {
        if (sql === 'COMMIT') throw new Error('commit failed');
        return { rows: sql.includes('FROM users') ? [{ id: 'user-id' }] : [] };
      }), release: jest.fn() };
      (db.pool.connect as any).mockResolvedValue(client);
      (redis.issueOtp as any).mockResolvedValueOnce(true);
      (redis.del as any).mockResolvedValueOnce(2);
      await expect(service.sendOTP('test@example.com')).rejects.toThrow('commit failed');
      expect(redis.del).toHaveBeenCalledWith('otp:test@example.com', 'rate_limit:otp:test@example.com');
      expect(resendMock.emails.send).not.toHaveBeenCalled();
    });
  });

  it('dev helper extracts only a structured OTP and rejects legacy bare codes', async () => {
    (redis.get as any).mockResolvedValueOnce('123456:00000000-0000-4000-8000-000000000001')
      .mockResolvedValueOnce('123456');
    await expect(service.getStoredOTP('test@example.com')).resolves.toBe('123456');
    await expect(service.getStoredOTP('test@example.com')).rejects.toThrow(UnauthorizedException);
  });

  describe('verifyOTP', () => {
    it('rejects a legacy bare code instead of allowing it to recreate a deleted account', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [] } as never), release: jest.fn() };
      (db.pool.connect as any).mockResolvedValue(client);
      (redis.consumeIfMatches as any).mockResolvedValueOnce(null);
      await expect(service.verifyOTP('test@example.com', '123456')).rejects.toThrow(UnauthorizedException);
      expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), expect.anything());
    });

    it('only accepts a code bound to the original still-existing user', async () => {
      (redis.consumeIfMatches as any).mockResolvedValueOnce('123456:00000000-0000-4000-8000-000000000001');
      (db.pool as any).connect = jest.fn().mockResolvedValue({
        query: jest.fn(async (sql: string) => ({ rows: sql.includes('FROM users') ? [] : [] })),
        release: jest.fn(),
      } as never);
      await expect(service.verifyOTP('test@example.com', '123456')).rejects.toThrow(UnauthorizedException);
      expect(db.pool.query).not.toHaveBeenCalled();
    });
    it('should throw if no OTP is found in Redis', async () => {
      (db.pool.connect as any).mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] } as never), release: jest.fn() });
      (redis.consumeIfMatches as any).mockResolvedValueOnce(null);

      await expect(service.verifyOTP('test@example.com', '123456')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw if OTP does not match', async () => {
      (db.pool.connect as any).mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] } as never), release: jest.fn() });
      (redis.consumeIfMatches as any).mockResolvedValueOnce(null);

      await expect(service.verifyOTP('test@example.com', '123456')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should verify OTP, consume it once, and create user session', async () => {
      (redis.consumeIfMatches as any).mockResolvedValueOnce('123456:00000000-0000-4000-8000-000000000001');
      const client = { query: jest.fn(async (sql: string) => ({ rows: sql.includes('FROM users')
        ? [{ id: '00000000-0000-4000-8000-000000000001', email: 'test@example.com' }]
        : sql.includes('session_tokens') ? [{ id: 'session-token-id' }] : [] })), release: jest.fn() };
      (db.pool.connect as any).mockResolvedValue(client);

      const result = await service.verifyOTP('test@example.com', '123456');

      expect(redis.consumeIfMatches).toHaveBeenCalledWith('otp:test@example.com', '123456');
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining('deletion_requested_at IS NULL FOR UPDATE'), ['00000000-0000-4000-8000-000000000001', 'test@example.com']);
      expect(result).toHaveProperty('token');
      expect(result.user_id).toBe('00000000-0000-4000-8000-000000000001');
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('entitlements', () => {
    it('treats missing entitlement as free and blocks correction feedback', async () => {
      (db.pool.query as any)
        .mockResolvedValueOnce({ rows: [{ entitlement_tier: null }] })
        .mockResolvedValueOnce({ rows: [{ entitlement_tier: null }] });

      await expect(service.getEntitlementTier('user-free')).resolves.toBe('free');
      await expect(service.canUseCorrections('user-free')).resolves.toBe(false);
    });

    it('allows correction feedback only for paid users', async () => {
      (db.pool.query as any)
        .mockResolvedValueOnce({ rows: [{ entitlement_tier: 'paid' }] })
        .mockResolvedValueOnce({ rows: [{ entitlement_tier: 'paid' }] });

      await expect(service.getEntitlementTier('user-paid')).resolves.toBe('paid');
      await expect(service.canUseCorrections('user-paid')).resolves.toBe(true);
    });
  });
});

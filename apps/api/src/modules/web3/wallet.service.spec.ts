import { WalletService } from './wallet.service.js';
import { BaseService } from './base.service.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('WalletService', () => {
  let service: WalletService;
  let baseService: BaseService;
  let mockDb: any;
  let challenges: Map<string, any>;
  let userWallets: Map<string, any>;

  const testUserId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    challenges = new Map();
    userWallets = new Map();

    mockDb = {
      pool: {
        query: jest.fn(async (sql: string, params: any[]) => {
          if (sql.includes('INSERT INTO wallet_auth_challenges')) {
            const [user_id, nonce, purpose, chain_id, expires_at] = params;
            challenges.set(nonce, {
              id: 'chal-1',
              user_id,
              nonce,
              purpose,
              chain_id,
              consumed: false,
              expires_at,
            });
            return { rows: [] };
          }

          if (sql.includes('FROM wallet_auth_challenges') && sql.includes('SELECT')) {
            const [nonce, user_id] = params;
            const c = challenges.get(nonce);
            if (c && c.user_id === user_id) {
              return { rows: [{ ...c }] };
            }
            return { rows: [] };
          }

          if (sql.includes('UPDATE wallet_auth_challenges')) {
            for (const [, c] of challenges) {
              if (c.id === params[0]) {
                c.consumed = true;
              }
            }
            return { rows: [] };
          }

          if (sql.includes('INSERT INTO user_wallets')) {
            const [user_id, address, chain_id, wallet_type] = params;
            const record = {
              id: 'wallet-uuid-1',
              user_id,
              address: address.toLowerCase(),
              chain_id,
              wallet_type,
              bound_at: new Date().toISOString(),
              verified_via: 'eip712',
            };
            userWallets.set(`${address.toLowerCase()}-${chain_id}`, record);
            return { rows: [record] };
          }

          if (sql.includes('DELETE FROM user_wallets')) {
            const [user_id, address, chain_id] = params;
            const key = `${address.toLowerCase()}-${chain_id}`;
            const existing = userWallets.get(key);
            if (existing && existing.user_id === user_id) {
              userWallets.delete(key);
              return { rows: [{ id: existing.id }] };
            }
            return { rows: [] };
          }

          if (sql.includes('FROM user_wallets') && sql.includes('SELECT')) {
            const [user_id] = params;
            const rows = Array.from(userWallets.values()).filter((w) => w.user_id === user_id);
            return { rows };
          }

          return { rows: [] };
        }),
      },
    };

    baseService = new BaseService();
    service = new WalletService(mockDb, baseService);
  });

  describe('createChallenge', () => {
    it('generates a valid EIP-712 challenge with 10-minute expiry and random nonce', async () => {
      const challenge = await service.createChallenge(testUserId, 'bind_wallet', 84532);

      expect(challenge.nonce).toMatch(/^0x[a-f0-9]{64}$/);
      expect(challenge.domain.chainId).toBe(84532);
      expect(challenge.message.userId).toBe(testUserId);
      expect(challenge.message.purpose).toBe('bind_wallet');
      expect(new Date(challenge.expiresAt).getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
      expect(mockDb.pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO wallet_auth_challenges'),
        expect.any(Array),
      );
    });
  });

  describe('bindWallet', () => {
    it('successfully binds an EOA wallet with valid EIP-712 signature and preserves original user ID', async () => {
      const privKey = generatePrivateKey();
      const account = privateKeyToAccount(privKey);

      const challenge = await service.createChallenge(testUserId, 'bind_wallet', 84532);

      const signature = await account.signTypedData({
        domain: challenge.domain,
        types: challenge.types,
        primaryType: 'EvaWalletAuth',
        message: challenge.message,
      });

      const result = await service.bindWallet(testUserId, {
        address: account.address,
        signature,
        nonce: challenge.nonce,
        chainId: 84532,
      });

      expect(result.success).toBe(true);
      expect(result.wallet.address).toBe(account.address.toLowerCase());
      expect(result.wallet.user_id).toBe(testUserId); // User ID is preserved!
      expect(result.wallet.wallet_type).toBe('eoa');
      expect(result.wallet.verified_via).toBe('eip712');
    });

    it('rejects signature replay attempts using the same challenge nonce', async () => {
      const privKey = generatePrivateKey();
      const account = privateKeyToAccount(privKey);

      const challenge = await service.createChallenge(testUserId, 'bind_wallet', 84532);

      const signature = await account.signTypedData({
        domain: challenge.domain,
        types: challenge.types,
        primaryType: 'EvaWalletAuth',
        message: challenge.message,
      });

      // First bind succeeds
      await service.bindWallet(testUserId, {
        address: account.address,
        signature,
        nonce: challenge.nonce,
        chainId: 84532,
      });

      // Second bind attempt with the exact same nonce must fail (replay protection)
      await expect(
        service.bindWallet(testUserId, {
          address: account.address,
          signature,
          nonce: challenge.nonce,
          chainId: 84532,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects expired challenge nonces', async () => {
      const privKey = generatePrivateKey();
      const account = privateKeyToAccount(privKey);

      const challenge = await service.createChallenge(testUserId, 'bind_wallet', 84532);

      // Force challenge to be expired
      const c = challenges.get(challenge.nonce);
      c.expires_at = new Date(Date.now() - 1000);

      const signature = await account.signTypedData({
        domain: challenge.domain,
        types: challenge.types,
        primaryType: 'EvaWalletAuth',
        message: challenge.message,
      });

      await expect(
        service.bindWallet(testUserId, {
          address: account.address,
          signature,
          nonce: challenge.nonce,
          chainId: 84532,
        }),
      ).rejects.toThrow('Challenge nonce has expired');
    });

    it('rejects signatures created by a different address', async () => {
      const legitAccount = privateKeyToAccount(generatePrivateKey());
      const attackerAccount = privateKeyToAccount(generatePrivateKey());

      const challenge = await service.createChallenge(testUserId, 'bind_wallet', 84532);

      // Attacker signs, but claims to be legitAccount
      const signature = await attackerAccount.signTypedData({
        domain: challenge.domain,
        types: challenge.types,
        primaryType: 'EvaWalletAuth',
        message: challenge.message,
      });

      await expect(
        service.bindWallet(testUserId, {
          address: legitAccount.address, // Claims to be legit
          signature, // Signed by attacker
          nonce: challenge.nonce,
          chainId: 84532,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unbindWallet and listWallets', () => {
    it('unbinds an existing wallet and updates wallet list', async () => {
      const privKey = generatePrivateKey();
      const account = privateKeyToAccount(privKey);

      const challenge = await service.createChallenge(testUserId, 'bind_wallet', 84532);
      const signature = await account.signTypedData({
        domain: challenge.domain,
        types: challenge.types,
        primaryType: 'EvaWalletAuth',
        message: challenge.message,
      });

      await service.bindWallet(testUserId, {
        address: account.address,
        signature,
        nonce: challenge.nonce,
        chainId: 84532,
      });

      const listBefore = await service.listWallets(testUserId);
      expect(listBefore.wallets.length).toBe(1);

      const unbindRes = await service.unbindWallet(testUserId, account.address, 84532);
      expect(unbindRes.success).toBe(true);

      const listAfter = await service.listWallets(testUserId);
      expect(listAfter.wallets.length).toBe(0);
    });

    it('throws NotFoundException when unbinding a wallet that is not bound', async () => {
      await expect(
        service.unbindWallet(testUserId, '0x0000000000000000000000000000000000000001', 84532),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

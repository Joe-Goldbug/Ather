import { Test, TestingModule } from '@nestjs/testing';
import { CredentialService } from './credential.service.js';
import { Database } from '../../common/database.js';
import { verifyCredentialOffline } from '@eva/core';

describe('CredentialService', () => {
  let service: CredentialService;
  let mockQuery: jest.Mock;

  beforeEach(async () => {
    mockQuery = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialService,
        {
          provide: Database,
          useValue: {
            pool: {
              query: mockQuery,
            },
          },
        },
      ],
    }).compile();

    service = module.get<CredentialService>(CredentialService);
  });

  it('exports a valid verifiable credential with digital signature', async () => {
    const userId = 'user-test-1';
    const recordId = 'rec-test-1';

    // Mock capture record query
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: recordId,
          user_id: userId,
          raw_text: 'Observed measured stress response during negotiation simulation',
          entry_type: 'quick_fragment',
          capture_mode: 'real',
          captured_at: new Date().toISOString(),
        },
      ],
    });

    // Mock user corrections query
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          status: 'confirmed',
          user_comment: 'Accurately reflects my cognitive style',
          updated_at: new Date().toISOString(),
        },
      ],
    });

    // Mock insert into issued_credentials
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const credential = await service.exportRecordCredential(userId, {
      recordId,
      recordType: 'observation',
      includeAnchor: true,
    });

    expect(credential).toBeDefined();
    expect(credential.schemaVersion).toBe('eva-credential-v1');
    expect(credential.recordId).toBe(recordId);
    expect(credential.claims.length).toBe(1);
    expect(credential.claims[0].userCorrection?.status).toBe('confirmed');
    expect(credential.onChainAnchor?.chain).toBe('base');
    expect(credential.onChainAnchor?.chainId).toBe(84532);

    // Verify cryptographic signature offline
    const verification = verifyCredentialOffline(credential);
    expect(verification.valid).toBe(true);
    expect(verification.tampered).toBe(false);
    expect(verification.signatureValid).toBe(true);
  });

  it('detects tampering if statement is modified after issuance', async () => {
    const userId = 'user-test-1';
    const recordId = 'rec-test-1';

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: recordId,
            user_id: userId,
            raw_text: 'Original record text',
            entry_type: 'quick_fragment',
            capture_mode: 'real',
            captured_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const credential = await service.exportRecordCredential(userId, { recordId });

    // Tamper
    credential.claims[0].statement = 'Forged or altered claim text';

    const verification = verifyCredentialOffline(credential);
    expect(verification.valid).toBe(false);
    expect(verification.tampered).toBe(true);
    expect(verification.digestMatch).toBe(false);
  });
});

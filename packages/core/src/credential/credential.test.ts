import { describe, expect, it } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  canonicalizeJson,
  computeClaimsDigest,
  verifyCredentialOffline,
  type EvaVerifiableCredential,
  type EvaCredentialClaim,
} from './index.js';

describe('Eva Verifiable Credentials', () => {
  it('canonicalizes JSON deterministically regardless of key order', () => {
    const a = { z: 1, a: 2, m: { y: 10, b: 20 } };
    const b = { a: 2, m: { b: 20, y: 10 }, z: 1 };
    expect(canonicalizeJson(a)).toBe(canonicalizeJson(b));
    expect(canonicalizeJson(a)).toBe('{"a":2,"m":{"b":20,"y":10},"z":1}');
  });

  it('signs and verifies a valid credential with user correction state', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

    const claims: EvaCredentialClaim[] = [
      {
        targetId: 'obs-001',
        claimType: 'observation',
        title: 'Emotional Resilience',
        statement: 'Demonstrates measured responses under interpersonal ambiguity',
        userCorrection: {
          status: 'confirmed',
          userComment: 'Accurately reflects my self-regulation in recent workplace review',
          updatedAt: '2026-10-09T10:00:00Z',
        },
      },
      {
        targetId: 'obs-002',
        claimType: 'observation',
        title: 'Risk Tolerance',
        statement: 'Hesitant during speculative venture scenario',
        userCorrection: {
          status: 'disputed',
          userComment: 'Clarification: My caution was due to incomplete regulatory parameters, not risk aversion',
          updatedAt: '2026-10-09T10:05:00Z',
        },
      },
    ];

    const contentDigest = computeClaimsDigest(claims);
    const signature = sign(null, Buffer.from(contentDigest, 'utf8'), privateKey).toString('hex');

    const credential: EvaVerifiableCredential = {
      schemaVersion: 'eva-credential-v1',
      credentialId: 'cred-12345',
      recordId: 'round-777',
      revisionId: 'rev-2',
      recordType: 'assessment',
      issuedAt: '2026-10-09T10:10:00Z',
      issuer: {
        id: 'did:eva:platform',
        name: 'Eva Cognition',
        publicKeyId: 'key-2026-primary',
        publicKeyPem,
      },
      claims,
      contentDigest,
      signature,
      onChainAnchor: {
        chain: 'base',
        chainId: 84532,
        status: 'confirmed',
        txHash: '0x1234567890abcdef',
        anchorId: `0x${contentDigest}`,
      },
    };

    const result = verifyCredentialOffline(credential, publicKeyPem);
    expect(result.valid).toBe(true);
    expect(result.tampered).toBe(false);
    expect(result.digestMatch).toBe(true);
    expect(result.signatureValid).toBe(true);
  });

  it('detects tampering when any claim field is modified', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

    const claims: EvaCredentialClaim[] = [
      {
        targetId: 'obs-001',
        claimType: 'observation',
        statement: 'Original observation text',
      },
    ];

    const contentDigest = computeClaimsDigest(claims);
    const signature = sign(null, Buffer.from(contentDigest, 'utf8'), privateKey).toString('hex');

    const credential: EvaVerifiableCredential = {
      schemaVersion: 'eva-credential-v1',
      credentialId: 'cred-tamper-test',
      recordId: 'round-1',
      revisionId: 'rev-1',
      recordType: 'observation',
      issuedAt: '2026-10-09T10:10:00Z',
      issuer: {
        id: 'did:eva:platform',
        name: 'Eva Cognition',
        publicKeyId: 'key-1',
        publicKeyPem,
      },
      claims,
      contentDigest,
      signature,
    };

    // Tamper with the statement
    credential.claims[0].statement = 'Tampered observation text!';

    const result = verifyCredentialOffline(credential);
    expect(result.valid).toBe(false);
    expect(result.tampered).toBe(true);
    expect(result.digestMatch).toBe(false);
    expect(result.reason).toContain('Content digest mismatch');
  });

  it('detects forged signatures with altered public key', () => {
    const keyPairA = generateKeyPairSync('ed25519');
    const keyPairB = generateKeyPairSync('ed25519');

    const claims: EvaCredentialClaim[] = [
      { targetId: 'obs-01', claimType: 'observation', statement: 'Sample statement' },
    ];
    const contentDigest = computeClaimsDigest(claims);
    // Signed with A
    const signature = sign(null, Buffer.from(contentDigest, 'utf8'), keyPairA.privateKey).toString('hex');

    const credential: EvaVerifiableCredential = {
      schemaVersion: 'eva-credential-v1',
      credentialId: 'cred-forgery',
      recordId: 'rec-1',
      revisionId: 'rev-1',
      recordType: 'observation',
      issuedAt: '2026-10-09T10:00:00Z',
      issuer: {
        id: 'did:eva:platform',
        name: 'Eva Cognition',
        publicKeyId: 'key-1',
        publicKeyPem: keyPairB.publicKey.export({ type: 'spki', format: 'pem' }) as string, // Wrong public key!
      },
      claims,
      contentDigest,
      signature,
    };

    const result = verifyCredentialOffline(credential);
    expect(result.valid).toBe(false);
    expect(result.signatureValid).toBe(false);
  });
});

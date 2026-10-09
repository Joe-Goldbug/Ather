import { verify, createPublicKey } from 'node:crypto';
import type { EvaVerifiableCredential, VerificationResult } from './types.js';
import { computeClaimsDigest } from './canonicalize.js';

/**
 * Verify an Eva Verifiable Credential completely offline.
 * Checks schemaVersion, content digest integrity, and cryptographic signature.
 */
export function verifyCredentialOffline(
  credential: EvaVerifiableCredential,
  trustedPublicKeyPem?: string,
): VerificationResult {
  const verifiedAt = new Date().toISOString();

  if (!credential || typeof credential !== 'object') {
    return {
      valid: false,
      tampered: true,
      offlineVerified: false,
      digestMatch: false,
      signatureValid: false,
      reason: 'Credential object is missing or invalid',
      verifiedAt,
    };
  }

  if (credential.schemaVersion !== 'eva-credential-v1') {
    return {
      valid: false,
      tampered: true,
      offlineVerified: false,
      digestMatch: false,
      signatureValid: false,
      reason: `Unsupported schemaVersion: ${credential.schemaVersion}`,
      verifiedAt,
    };
  }

  // 1. Content digest integrity check
  const calculatedDigest = computeClaimsDigest(credential.claims || []);
  const digestMatch = calculatedDigest === credential.contentDigest;
  if (!digestMatch) {
    return {
      valid: false,
      tampered: true,
      offlineVerified: false,
      digestMatch: false,
      signatureValid: false,
      reason: `Content digest mismatch. Expected ${credential.contentDigest}, calculated ${calculatedDigest}`,
      verifiedAt,
    };
  }

  // 2. Cryptographic signature check
  const pemToUse = trustedPublicKeyPem || credential.issuer?.publicKeyPem;
  if (!pemToUse) {
    return {
      valid: false,
      tampered: false,
      offlineVerified: false,
      digestMatch: true,
      signatureValid: false,
      reason: 'No public key available for signature verification',
      verifiedAt,
    };
  }

  try {
    const keyObject = createPublicKey(pemToUse);
    const dataBuffer = Buffer.from(credential.contentDigest, 'utf8');
    const signatureBuffer = Buffer.from(credential.signature, 'hex');

    let signatureValid = false;
    if (keyObject.asymmetricKeyType === 'ed25519') {
      signatureValid = verify(null, dataBuffer, keyObject, signatureBuffer);
    } else {
      signatureValid = verify('sha256', dataBuffer, keyObject, signatureBuffer);
    }

    if (!signatureValid) {
      return {
        valid: false,
        tampered: true,
        offlineVerified: false,
        digestMatch: true,
        signatureValid: false,
        reason: 'Cryptographic signature is invalid or does not match content',
        verifiedAt,
      };
    }

    return {
      valid: true,
      tampered: false,
      offlineVerified: true,
      digestMatch: true,
      signatureValid: true,
      verifiedAt,
    };
  } catch (err) {
    return {
      valid: false,
      tampered: true,
      offlineVerified: false,
      digestMatch: true,
      signatureValid: false,
      reason: `Signature verification error: ${err instanceof Error ? err.message : String(err)}`,
      verifiedAt,
    };
  }
}

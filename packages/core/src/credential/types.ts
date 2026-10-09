export type CredentialRecordType = 'observation' | 'assessment' | 'portrait';

export interface UserCorrectionStatus {
  status: 'confirmed' | 'disputed' | 'supplemented';
  userComment?: string;
  updatedAt: string;
}

export interface EvaCredentialClaim {
  targetId: string;
  claimType: 'observation' | 'assessment_round' | 'portrait_dimension';
  title?: string;
  statement: string;
  metadata?: Record<string, unknown>;
  userCorrection?: UserCorrectionStatus;
}

export interface OnChainAnchor {
  chain: 'base';
  chainId: number; // 84532 for Base Sepolia, 8453 for Base Mainnet
  contractAddress?: string;
  anchorId?: string; // bytes32 credential hash or attestation UID
  txHash?: string;
  blockNumber?: number;
  status: 'pending' | 'submitted' | 'confirmed' | 'finalized';
  anchoredAt?: string;
}

export interface EvaVerifiableCredential {
  schemaVersion: 'eva-credential-v1';
  credentialId: string;
  recordId: string;
  revisionId: string;
  recordType: CredentialRecordType;
  issuedAt: string;
  issuer: {
    id: string; // 'did:eva:platform'
    name: string; // 'Eva Cognition'
    publicKeyId: string;
    publicKeyPem: string;
  };
  claims: EvaCredentialClaim[];
  contentDigest: string; // hex sha256 of canonicalized claims
  signature: string; // hex signature over contentDigest
  onChainAnchor?: OnChainAnchor;
}

export interface VerificationResult {
  valid: boolean;
  tampered: boolean;
  offlineVerified: boolean;
  digestMatch: boolean;
  signatureValid: boolean;
  reason?: string;
  verifiedAt: string;
  onlineStatus?: {
    status: 'valid' | 'revoked' | 'superseded' | 'unconfirmed';
    queriedAt: string;
    supersededBy?: string;
    onChainStatus?: string;
  };
}

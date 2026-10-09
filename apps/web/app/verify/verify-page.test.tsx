import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VerifyPage from './page';

describe('VerifyPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders verify page with header, file input, and paste textarea', () => {
    render(<VerifyPage />);
    expect(screen.getByText('Eva 记录凭证查验')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/在此粘贴 .eva.json 凭证内容/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '立即查验' })).toBeInTheDocument();
  });

  it('shows error if invalid json is provided', async () => {
    render(<VerifyPage />);
    const textarea = screen.getByPlaceholderText(/在此粘贴 .eva.json 凭证内容/);
    fireEvent.change(textarea, { target: { value: 'not-valid-json' } });
    fireEvent.click(screen.getByRole('button', { name: '立即查验' }));

    expect(await screen.findByText('无法解析 JSON 文件，请确认格式是否正确')).toBeInTheDocument();
  });

  it('verifies valid credential and renders Layer 1 validity and Layer 2 Base Sepolia anchor with Basescan link', async () => {
    const mockCred = {
      schemaVersion: 'eva-credential-v1',
      credentialId: 'cred-test-1234',
      recordId: 'rec-test-1',
      revisionId: '1',
      recordType: 'observation',
      issuedAt: '2026-10-09T00:00:00.000Z',
      issuer: {
        id: 'did:eva:platform',
        name: 'Eva Cognition',
      },
      contentDigest: 'digest1234',
      signature: 'sig1234',
      onChainAnchor: {
        chain: 'base',
        chainId: 84532,
        anchorId: '0xdigest1234',
        status: 'confirmed',
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      },
      claims: [
        {
          targetId: 'rec-test-1',
          claimType: 'observation',
          title: 'Observation fragment (quick_fragment)',
          statement: 'Captured user reflection text',
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        valid: true,
        tampered: false,
        digestMatch: true,
        signatureValid: true,
        verifiedAt: new Date().toISOString(),
        onlineStatus: {
          status: 'valid',
          queriedAt: new Date().toISOString(),
          onChainStatus: 'confirmed',
          onChainTxHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      }),
    } as any);

    render(<VerifyPage />);
    const textarea = screen.getByPlaceholderText(/在此粘贴 .eva.json 凭证内容/);
    fireEvent.change(textarea, { target: { value: JSON.stringify(mockCred) } });
    fireEvent.click(screen.getByRole('button', { name: '立即查验' }));

    expect(await screen.findByText(/签名有效 · 内容未受篡改/)).toBeInTheDocument();
    expect(screen.getByText(/Base 链上存证信息 \(Layer 2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Base Sepolia \(Chain ID: 84532\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /0x1234567890abcdef/ })).toHaveAttribute(
      'href',
      'https://sepolia.basescan.org/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    );
  });
});

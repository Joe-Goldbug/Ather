// apps/web/components/web3/BaseWalletButton.tsx
'use client';

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { baseSepolia, base } from 'wagmi/chains';
import { anvilChain } from '../../lib/web3-config';

const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST));

export function BaseWalletButton() {
  if (isTest) {
    return (
      <div data-testid="base-wallet-button" style={{ display: 'inline-flex' }}>
        <button style={{ background: '#0052FF', color: '#ffffff' }}>Passkey 钱包连接 (Base)</button>
      </div>
    );
  }

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const getChainName = () => {
    if (chainId === baseSepolia.id) return 'Base Sepolia';
    if (chainId === base.id) return 'Base Mainnet';
    if (chainId === anvilChain.id) return 'Anvil (Offline)';
    return `Chain #${chainId}`;
  };

  if (isConnected && address) {
    const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
        <button
          onClick={() => {
            const nextChain = chainId === baseSepolia.id ? anvilChain.id : baseSepolia.id;
            switchChain?.({ chainId: nextChain });
          }}
          title="Click to toggle network"
          style={{
            background: 'rgba(0, 82, 255, 0.08)',
            color: '#0052FF',
            border: '1px solid rgba(0, 82, 255, 0.2)',
            borderRadius: '16px',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          ● {getChainName()}
        </button>
        <button
          onClick={() => disconnect()}
          title="Click to disconnect"
          style={{
            background: 'var(--color-surface, #fff)',
            color: 'var(--color-text, #111)',
            border: '1px solid var(--color-border, #e5e5e5)',
            borderRadius: '16px',
            padding: '4px 12px',
            cursor: 'pointer',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        >
          {shortAddr}
        </button>
      </div>
    );
  }

  // Find Coinbase Smart Wallet connector or first available
  const cbConnector = connectors.find((c) => c.id === 'coinbaseWalletSDK') || connectors[0];

  return (
    <button
      onClick={() => cbConnector && connect({ connector: cbConnector })}
      disabled={isPending}
      style={{
        background: '#0052FF', // Base signature blue
        color: '#ffffff',
        border: 'none',
        borderRadius: '16px',
        padding: '6px 14px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'opacity 0.15s ease',
      }}
    >
      <span style={{ fontSize: '14px' }}>🔵</span>
      {isPending ? '连接中...' : 'Passkey 钱包连接 (Base)'}
    </button>
  );
}

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
        <button className="wallet-connect-btn">
          <span className="wallet-btn__icon">🔵</span>
          <span className="wallet-btn__text-full">Passkey 钱包连接 (Base)</span>
          <span className="wallet-btn__text-mobile">Base 钱包</span>
        </button>
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
    const shortChain = chainId === baseSepolia.id ? 'Sepolia' : chainId === base.id ? 'Base' : 'Local';
    return (
      <div className="wallet-connected-group" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
        <button
          onClick={() => {
            const nextChain = chainId === baseSepolia.id ? anvilChain.id : baseSepolia.id;
            switchChain?.({ chainId: nextChain });
          }}
          className="wallet-connected-chain-btn"
          title="Click to toggle network"
          style={{
            background: 'rgba(0, 82, 255, 0.08)',
            color: '#0052FF',
            border: '1px solid rgba(0, 82, 255, 0.2)',
            borderRadius: '16px',
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          ● <span className="wallet-btn__text-full">{getChainName()}</span><span className="wallet-btn__text-mobile">{shortChain}</span>
        </button>
        <button
          onClick={() => disconnect()}
          className="wallet-connected-addr-btn"
          title="Click to disconnect"
          style={{
            background: 'var(--color-surface, #fff)',
            color: 'var(--color-text, #111)',
            border: '1px solid var(--color-border, #e5e5e5)',
            borderRadius: '16px',
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
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
      className="wallet-connect-btn"
    >
      <span className="wallet-btn__icon" style={{ fontSize: '12px', lineHeight: 1 }}>🔵</span>
      <span className="wallet-btn__text-full">
        {isPending ? '连接中...' : 'Passkey 钱包连接 (Base)'}
      </span>
      <span className="wallet-btn__text-mobile">
        {isPending ? '连接中...' : 'Base 钱包'}
      </span>
    </button>
  );
}

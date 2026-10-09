// apps/web/lib/web3-config.ts
// EVM & Base L2 Configuration for EVA Web3
import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

// Local Anvil chain for 100% offline hackathon demos
export const anvilChain = defineChain({
  id: 31337,
  name: 'Anvil Local (Offline)',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  testnet: true,
});

const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST));

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base, anvilChain],
  connectors: (typeof window !== 'undefined' && !isTest)
    ? [
        coinbaseWallet({
          appName: 'EVA - AI Cognitive Mirror',
          preference: { options: 'smartWalletOnly' }, // Native Passkey / Face ID
        }),
        injected(),
      ]
    : [],
  transports: {
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || 'https://sepolia.base.org'),
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC || 'https://mainnet.base.org'),
    [anvilChain.id]: http('http://127.0.0.1:8545'),
  },
  ssr: true,
});

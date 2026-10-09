export interface BaseNetworkConfig {
  chainId: number;
  rpcUrl: string;
  anchorContract: `0x${string}`;
  explorerUrl: string;
}

export const baseConfig: BaseNetworkConfig = {
  chainId: Number(process.env.BASE_CHAIN_ID || 84532), // Base Sepolia by default
  rpcUrl: process.env.BASE_RPC_URL || 'https://sepolia.base.org',
  anchorContract: (process.env.BASE_ANCHOR_CONTRACT || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  explorerUrl: process.env.BASE_EXPLORER_URL || 'https://sepolia.basescan.org',
};

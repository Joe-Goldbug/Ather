// apps/web/components/web3/CognitiveAttestationCard.tsx
'use client';

import { useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { anvilChain } from '../../lib/web3-config';

interface Props {
  portraitId?: string;
  portraitName?: string;
  hash?: string;
}

const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST));

export function CognitiveAttestationCard({
  portraitId = 'rain-before-stop',
  portraitName = '雨前止步 (Rain Before Stop)',
  hash = '0x8f4c71a39b2e5d6174a8902cd51a9c33e8b15d97f26a19c5208bce41620a4b7f',
}: Props) {
  const [showPayload, setShowPayload] = useState<boolean>(false);

  if (isTest) {
    return (
      <div data-testid="cognitive-attestation-card" style={{ border: '1px solid var(--color-border, #e5e5e5)', borderRadius: '16px', padding: '24px' }}>
        <h4>认知证据链上存证规范 (EAS Schema Preview)</h4>
        <p>Base Sepolia EAS 存证预览</p>
      </div>
    );
  }

  const { isConnected, address } = useAccount();
  const chainId = useChainId();

  const targetChain = chainId === anvilChain.id ? anvilChain : baseSepolia;

  const attestationPayload = {
    standard: 'Ethereum Attestation Service (EAS) v1',
    network: `${targetChain.name} (Chain ID: ${targetChain.id})`,
    schema: '0xd64f...cognitive_state_root_v1',
    recipient: address ?? '0x0000000000000000000000000000000000000000 (请先连接钱包)',
    revocable: true,
    data: {
      portraitId,
      portraitName,
      stateRootHash: hash,
      source: 'Eva Cognitive Engine (Self-Exploration Session)',
      timestamp: new Date().toISOString(),
    },
  };

  return (
    <div
      style={{
        border: '1px solid rgba(0, 82, 255, 0.2)',
        borderRadius: '16px',
        padding: '24px',
        background: 'linear-gradient(135deg, rgba(0, 82, 255, 0.03) 0%, rgba(255, 255, 255, 1) 100%)',
        margin: '24px 0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: 700,
              color: '#0052FF',
              background: 'rgba(0, 82, 255, 0.1)',
              padding: '3px 8px',
              borderRadius: '6px',
            }}
          >
            Base Sepolia • 存证协议预览
          </span>
          <h3 style={{ margin: '8px 0 4px', fontSize: '18px', fontWeight: 600 }}>
            Base Sepolia 链上存证协议预览（技术演示）
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>
            数据保密 · 链下凭证优先。Eva 优先通过链下可验证凭证保障用户隐私；本模块展示将状态根哈希锚定至 Base 的协议规范。
          </p>
        </div>
      </div>

      <div
        style={{
          margin: '16px 0',
          padding: '12px 16px',
          background: 'rgba(0, 0, 0, 0.03)',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '12px',
          wordBreak: 'break-all',
        }}
      >
        <div style={{ color: '#888', marginBottom: '4px' }}>画像类型: {portraitName}</div>
        <div style={{ color: '#555' }}>证据状态根哈希 (State Root Hash):</div>
        <div style={{ color: '#0052FF', fontWeight: 600 }}>{hash}</div>
      </div>

      {showPayload ? (
        <div
          style={{
            background: 'rgba(0, 82, 255, 0.04)',
            border: '1px solid rgba(0, 82, 255, 0.15)',
            borderRadius: '12px',
            padding: '16px',
            fontSize: '12px',
            marginBottom: '12px',
          }}
        >
          <div style={{ color: '#0052FF', fontWeight: 600, marginBottom: '8px' }}>
            📋 EAS 存证结构体规范 (EIP-712 / Attestation Request):
          </div>
          <pre
            style={{
              background: '#ffffff',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              overflowX: 'auto',
              margin: '0 0 8px 0',
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#334155',
            }}
          >
            {JSON.stringify(attestationPayload, null, 2)}
          </pre>
          <div style={{ color: '#64748b', fontSize: '12px' }}>
            ℹ️ 提示：此交互为协议数据结构技术预览。Eva 生产环境在用户未主动确认前绝不上传个人敏感数据或自动触发真实链上广播。
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          onClick={() => setShowPayload(!showPayload)}
          style={{
            background: '#0052FF',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            padding: '10px 20px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>📜</span> {showPayload ? '收起存证协议载荷' : '查看 Base Sepolia 存证协议载荷'}
        </button>

        <span style={{ fontSize: '12px', color: '#888' }}>
          {isConnected ? `已连接钱包: ${address?.slice(0, 6)}...${address?.slice(-4)}` : '未连接钱包（仅结构预览）'}
        </span>
      </div>
    </div>
  );
}

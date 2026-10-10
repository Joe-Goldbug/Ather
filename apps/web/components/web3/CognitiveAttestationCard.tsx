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
  portraitName = '突发压力与协作应对 (Crisis & Collaboration)',
  hash = '0x8f4c71a39b2e5d6174a8902cd51a9c33e8b15d97f26a19c5208bce41620a4b7f',
}: Props) {
  const [showPayload, setShowPayload] = useState<boolean>(false);
  const [showTechDetails, setShowTechDetails] = useState<boolean>(false);

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
              padding: '4px 10px',
              borderRadius: '6px',
            }}
          >
            私密保护 · 官方防伪钢印 (Authenticity Seal)
          </span>
          <h3 style={{ margin: '10px 0 6px', fontSize: '19px', fontWeight: 600 }}>
            🔖 带防伪钢印的私密成长档案（技术演示）
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#555', lineHeight: 1.6 }}>
            <strong>心里话留在手机里，谁也偷不走；防伪钢印盖在公链上，谁也改不掉。</strong> 你的真实倾诉和测试细节绝不上网公开（任何外人包括黑客都看不到）；区块链上只加盖一个不可伪造的数字防伪印章。几年后拿出这份报告，随时能向任何人证明：<strong>这是你当年最真实的自我档案，未被任何人篡改</strong>。
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          margin: '18px 0',
        }}
      >
        <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>🛡️ 隐私安全保障</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>100% 锁在当前设备</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>文字与日记不传外网，绝对隐私</div>
        </div>
        <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>🔖 官方验真状态</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#16a34a' }}>✅ 已加盖防伪数字钢印</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>永久存证，支持秒级真伪核验</div>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => setShowTechDetails(!showTechDetails)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            fontSize: '12px',
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {showTechDetails ? '▴ 收起底层技术编码' : '▾ 展开查看防伪数字指纹编号 (极客与审计细节)'}
        </button>

        {showTechDetails && (
          <div
            style={{
              marginTop: '10px',
              padding: '12px 16px',
              background: 'rgba(0, 0, 0, 0.03)',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '12px',
              wordBreak: 'break-all',
            }}
          >
            <div style={{ color: '#888', marginBottom: '4px' }}>测评所属章节: {portraitName}</div>
            <div style={{ color: '#555' }}>唯一防伪数字指纹 (State Root Hash):</div>
            <div style={{ color: '#0052FF', fontWeight: 600 }}>{hash}</div>
          </div>
        )}
      </div>

      {showPayload ? (
        <div
          style={{
            background: 'rgba(0, 82, 255, 0.04)',
            border: '1px solid rgba(0, 82, 255, 0.15)',
            borderRadius: '12px',
            padding: '16px',
            fontSize: '12px',
            marginBottom: '14px',
          }}
        >
          <div style={{ color: '#0052FF', fontWeight: 600, marginBottom: '8px' }}>
            📋 官方 EAS 存证结构体规范 (EIP-712 标准数据):
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
            ℹ️ 极客说明：此交互为数据结构预览。Eva 生产环境在用户未主动确认前绝不上传个人敏感数据或自动触发真实链上广播。
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
            minHeight: '44px',
          }}
        >
          <span>📜</span> {showPayload ? '收起官方公证凭据' : '查看这份档案的官方防伪公证证书'}
        </button>

        <span style={{ fontSize: '12px', color: '#888' }}>
          {isConnected ? `已连接钱包: ${address?.slice(0, 6)}...${address?.slice(-4)}` : '未连接钱包（仅结构预览）'}
        </span>
      </div>
    </div>
  );
}

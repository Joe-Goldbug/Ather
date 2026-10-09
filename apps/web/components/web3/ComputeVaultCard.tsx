// apps/web/components/web3/ComputeVaultCard.tsx
'use client';

import { useState } from 'react';

export function ComputeVaultCard() {
  const [depositAmount, setDepositAmount] = useState<number>(500);
  const apy = 0.048; // 4.8% US Treasury RWA yield (e.g. Ondo USDY / BlackRock BUIDL)
  const annualYield = depositAmount * apy;
  const monthlyYield = annualYield / 12;
  const dailyYield = annualYield / 365;

  // Assume $0.0001 per 1,000 tokens for lightweight model inference
  const dailyTokens = Math.floor(dailyYield / 0.000002);

  return (
    <div
      style={{
        border: '1px solid var(--color-border, #e5e5e5)',
        borderRadius: '16px',
        padding: '24px',
        background: 'var(--color-surface, #ffffff)',
        boxShadow: '0 4px 20px rgba(0, 82, 255, 0.05)',
        margin: '24px 0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <span
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: 700,
              color: '#0052FF',
              background: 'rgba(0, 82, 255, 0.08)',
              padding: '3px 8px',
              borderRadius: '6px',
            }}
          >
            Base L2 • DePIN / 概念探索（未上线）
          </span>
          <h3 style={{ margin: '8px 0 4px', fontSize: '18px', fontWeight: 600 }}>
            DePIN 认知算力基金设想 (Concept Sandbox)
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>
            算力冲抵机制设想：探索利用链上生息资产冲抵 AI 智能体 Token 算力成本的可行性（概念探索阶段，非第一版交付内容，不构成收益承诺）。
          </p>
        </div>
      </div>

      <div style={{ margin: '20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
          <span>模拟质押 USDC 规模:</span>
          <strong>${depositAmount} USDC</strong>
        </div>
        <input
          type="range"
          min={100}
          max={5000}
          step={100}
          value={depositAmount}
          onChange={(e) => setDepositAmount(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#0052FF', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888', marginTop: '4px' }}>
          <span>$100 (基础测算)</span>
          <span>$500 (典型测算)</span>
          <span>$2,000</span>
          <span>$5,000 (极客模型)</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          background: 'rgba(0, 0, 0, 0.02)',
          borderRadius: '12px',
          padding: '16px',
          margin: '16px 0',
        }}
      >
        <div>
          <div style={{ fontSize: '12px', color: '#777' }}>宏观参考收益率 (APY)</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#0052FF' }}>~4.8%</div>
          <div style={{ fontSize: '11px', color: '#999' }}>短期合规美债底层参考</div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#777' }}>预估年化产出</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#111' }}>
            ${annualYield.toFixed(2)} / 年
          </div>
          <div style={{ fontSize: '11px', color: '#999' }}>约 ${monthlyYield.toFixed(2)} / 月</div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#777' }}>预估折合每日算力</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>
            ~{dailyTokens.toLocaleString()} Token
          </div>
          <div style={{ fontSize: '11px', color: '#999' }}>模拟覆盖每日 ~20 次探索</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: '#555', marginTop: '12px' }}>
        <span>⚠️</span>
        <span>
          <strong>风险与免责提示</strong>：去中心化金融协议存在智能合约风险、脱锚风险与市场波动风险。任何收益率均根据历史市场数据测算，不代表确定回报承诺。本模块为产品未来生态探索，不构成任何投资或财务建议。
        </span>
      </div>
    </div>
  );
}

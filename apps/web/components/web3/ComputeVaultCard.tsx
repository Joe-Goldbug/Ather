// apps/web/components/web3/ComputeVaultCard.tsx
'use client';

import { useState } from 'react';

export function ComputeVaultCard() {
  const [depositAmount, setDepositAmount] = useState<number>(200);
  const apy = 0.048; // 4.8% US Treasury RWA yield (e.g. Ondo USDY / BlackRock BUIDL)
  const annualYield = depositAmount * apy;
  const monthlyYield = annualYield / 12;
  const dailyYield = annualYield / 365;

  // Assume $0.0001 per 1,000 tokens for lightweight model inference
  const dailyTokens = Math.floor(dailyYield / 0.000002);
  const dailyExplorations = Math.max(1, Math.floor(dailyTokens / 6000));

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
              padding: '4px 10px',
              borderRadius: '6px',
            }}
          >
            零订阅费设想 · 随存随取 (Zero Subscription Sandbox)
          </span>
          <h3 style={{ margin: '10px 0 6px', fontSize: '19px', fontWeight: 600 }}>
            🏦 永续算力小金库：用零花钱利息替你付 AI 费用
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#555', lineHeight: 1.6 }}>
            你不需要按月充值会员费。尝试放一笔闲置备用金在你的专属小金库里（<strong>本金随时可 100% 全额取回，不扣任何手续费</strong>）；系统只使用它每天产生的一两分钱微小利息，替你支付 AI 深度探索的计算电费，让你<strong>终身零成本探索自我</strong>。
          </p>
        </div>
      </div>

      <div style={{ margin: '22px 0', padding: '16px', background: 'rgba(0, 82, 255, 0.02)', borderRadius: '12px', border: '1px solid rgba(0, 82, 255, 0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '15px' }}>
          <span style={{ fontWeight: 500 }}>放进小金库的备用金额（随时可全额取回）:</span>
          <strong style={{ fontSize: '18px', color: '#0052FF' }}>${depositAmount}</strong>
        </div>
        <input
          type="range"
          min={20}
          max={2000}
          step={20}
          value={depositAmount}
          onChange={(e) => setDepositAmount(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#0052FF', cursor: 'pointer', height: '6px' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#777', marginTop: '6px' }}>
          <span>$20 (零花钱起步)</span>
          <span>$100 (体验档)</span>
          <span>$500 (日常充足)</span>
          <span>$2,000 (极客高频)</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          background: 'rgba(0, 0, 0, 0.02)',
          borderRadius: '12px',
          padding: '16px',
          margin: '16px 0',
        }}
      >
        <div style={{ padding: '8px' }}>
          <div style={{ fontSize: '12px', color: '#777', marginBottom: '4px' }}>🛡️ 本金安全保障</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#0052FF' }}>~{ (apy * 100).toFixed(1) }%</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>底层为高信用国债收益，本金分文不损</div>
        </div>
        <div style={{ padding: '8px' }}>
          <div style={{ fontSize: '12px', color: '#777', marginBottom: '4px' }}>☕ 自动抵扣开销</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#111' }}>
            约 ${monthlyYield.toFixed(2)} / 月
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>本金分毫不扣，仅用微小利息付 AI 费</div>
        </div>
        <div style={{ padding: '8px' }}>
          <div style={{ fontSize: '12px', color: '#777', marginBottom: '4px' }}>🎁 你的专属特权</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>
            每日约 {dailyExplorations} 次深度对话
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>无需每月充值会员，终生不花一分钱</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: '#666', marginTop: '14px', lineHeight: 1.5 }}>
        <span style={{ fontSize: '14px' }}>💡</span>
        <span>
          <strong>给你的安心须知</strong>：资金由你自己完全掌控，随时可以 100% 全额撤回。本模块为未来经济模型的理念测算演示，不是投资理财产品，不构成任何收益承诺。
        </span>
      </div>
    </div>
  );
}

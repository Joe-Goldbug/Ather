'use client';

import React, { useState } from 'react';

interface VerificationResponse {
  valid: boolean;
  tampered: boolean;
  digestMatch: boolean;
  signatureValid: boolean;
  reason?: string;
  verifiedAt: string;
  onlineStatus?: {
    status: 'valid' | 'revoked' | 'superseded' | 'unconfirmed';
    queriedAt: string;
    supersededBy?: string;
    onChainStatus?: string;
    onChainTxHash?: string;
  };
}

const SAMPLE_DEMO_CREDENTIAL = {
  schemaVersion: 'eva-credential-v1',
  credentialId: 'eva-cred-sample-demo-2026',
  recordId: 'eva-rec-portrait-demo',
  revisionId: '1',
  recordType: 'mental_mirror_portrait',
  issuedAt: '2026-10-09T09:00:00.000Z',
  issuer: {
    id: 'did:eva:platform:official',
    name: 'Eva 心智计算引擎 (官方防伪签发中心)',
    publicKeyPem:
      '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAlLB30TZJxm8OnIzVG7acb8ybPUEJk1OOO0mCxUIparc=\n-----END PUBLIC KEY-----\n',
  },
  contentDigest: 'e9f294d0aa56413a6723eb17974c17a3be2d11ce6eb7e2dd8071618a173a5c2b',
  signature:
    '3972306cf2a5c17a1c3f99147815961a92ca11f89d1062cc5d546a629f568fce9d96e80b921f03209664abb5e124cc86c15ab750ff71445116b958450ee24f0e',
  onChainAnchor: {
    chain: 'base',
    chainId: 84532,
    anchorId: '0xe9f294d0aa56413a6723eb17974c17a3be2d11ce6eb7e2dd8071618a173a5c2b',
    status: 'confirmed',
    txHash: '0x3a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b',
  },
  claims: [
    {
      targetId: 'obs-demo-01',
      claimType: 'thinking_pattern',
      title: '情绪与压力应对 (深度观察)',
      statement:
        '在突发多任务高压情境中，倾向于先主动拉开心理距离、暂停即时反应，待理清因果全貌后再做决断。',
      userCorrection: {
        status: 'confirmed',
        userComment: '本人确认：符合真实工作习惯，我习惯等信息完整后再做决断。',
      },
    },
    {
      targetId: 'obs-demo-02',
      claimType: 'collaboration_boundary',
      title: '人际协作边界 (情境观察)',
      statement:
        '面对权责模糊的外部协作时，倾向于明确白纸黑字规则与底线，控制个人承诺的暴露程度。',
      userCorrection: {
        status: 'clarified',
        userComment: '补充背景：对不熟悉的跨团队合作成立，但对内部信任搭档会更灵活。',
      },
    },
  ],
};

export default function VerifyPage() {
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [parsedCred, setParsedCred] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const handleVerify = async (content: string) => {
    setError(null);
    setResult(null);
    setParsedCred(null);

    let parsed: any;
    try {
      parsed = JSON.parse(content.trim());
      setParsedCred(parsed);
    } catch {
      setError('无法解析 JSON 文件，请确认格式是否正确');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/credentials/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      if (!res.ok) {
        throw new Error(`服务响应错误 (${res.status})`);
      }
      const data: VerificationResponse = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err?.message || '验签服务请求失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setJsonInput(text);
      void handleVerify(text);
    };
    reader.readAsText(file);
  };

  const handleLoadSample = () => {
    const sampleText = JSON.stringify(SAMPLE_DEMO_CREDENTIAL, null, 2);
    setJsonInput(sampleText);
    void handleVerify(sampleText);
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6">
      {/* 标题与通俗导言 */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 mb-3">
          <span>🛡️ 个人心智防伪认证中心</span>
          <span className="text-emerald-400">·</span>
          <span>独立可信查验</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Eva 记录凭证查验
        </h1>
        <p className="mt-2 text-sm text-neutral-600 max-w-xl mx-auto">
          独立核验认知记录的完整性、签发者签名、用户纠偏声明及链上存证状态
        </p>
      </div>

      {/* Web2 用户通俗指南卡片 */}
      <div className="bg-gradient-to-br from-neutral-50 to-white border border-neutral-200/80 rounded-2xl p-5 mb-8 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="text-2xl select-none">💡</span>
          <div className="space-y-2 text-sm">
            <h2 className="font-semibold text-neutral-800">
              为什么普通用户需要这份查验？（像“学信网认证”与“电子发票查验”）
            </h2>
            <p className="text-neutral-600 leading-relaxed text-xs sm:text-sm">
              当您将自己的心智画像出示给求职团队、新 AI 助手、合作搭档或导师时，对方
              <strong className="text-neutral-900 font-medium">无需窥探您与 Eva 的私密聊天流水</strong>，只需将凭证放入此处，即可秒级核实：
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="p-2.5 bg-white border border-neutral-200 rounded-lg text-xs">
                <span className="font-medium text-neutral-800 block mb-0.5">1. 官方防伪公章</span>
                <span className="text-neutral-500">证明确系 Eva 官方签发，杜绝截图与 F12 本地篡改。</span>
              </div>
              <div className="p-2.5 bg-white border border-neutral-200 rounded-lg text-xs">
                <span className="font-medium text-neutral-800 block mb-0.5">2. 保留个人主权</span>
                <span className="text-neutral-500">完整附带您的本人确认或反驳自述，绝不武断定性。</span>
              </div>
              <div className="p-2.5 bg-white border border-neutral-200 rounded-lg text-xs">
                <span className="font-medium text-neutral-800 block mb-0.5">3. 隐私零泄露</span>
                <span className="text-neutral-500">仅核验证书结论与防伪指纹，私聊原文永不外泄。</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 查验输入与快捷体验区域 */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm mb-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="block text-sm font-medium text-neutral-700">
            上传凭证文件 (.json) 或粘贴凭证内容
          </label>
          {/* 一键载入演示凭证按钮 */}
          <button
            type="button"
            onClick={handleLoadSample}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-medium transition"
          >
            <span>✨ 载入官方演示凭证体验</span>
          </button>
        </div>

        <div>
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-neutral-100 file:text-neutral-700 hover:file:bg-neutral-200 cursor-pointer"
          />
        </div>

        <textarea
          rows={5}
          className="w-full p-3 font-mono text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-black focus:outline-none"
          placeholder="在此粘贴 .eva.json 凭证内容..."
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-neutral-400">
            提示：支持导出自心智镜像档案的 .eva.json 凭证文件
          </span>
          <button
            onClick={() => void handleVerify(jsonInput)}
            disabled={loading || !jsonInput.trim()}
            className="px-5 py-2.5 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 transition"
          >
            {loading ? '正在查验...' : '立即查验'}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-6 flex items-start gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* 查验报告结果 */}
      {result && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm space-y-6">
          {/* 状态徽章 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neutral-100 gap-2">
            <div>
              <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                密码学校验结果
              </span>
              <div className="mt-1 flex items-center gap-2">
                {result.valid ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-800">
                    ✅ 签名有效 · 内容未受篡改
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-rose-100 text-rose-800">
                    ❌ 验签失败 · 存在篡改风险
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                在线凭证状态
              </span>
              <div className="mt-1">
                {result.onlineStatus?.status === 'valid' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    当前有效 (Valid)
                  </span>
                )}
                {result.onlineStatus?.status === 'revoked' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-neutral-200 text-neutral-800">
                    已撤销 (Revoked)
                  </span>
                )}
                {result.onlineStatus?.status === 'superseded' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
                    已被新版本替代
                  </span>
                )}
                {result.onlineStatus?.status === 'unconfirmed' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-neutral-100 text-neutral-600">
                    当前状态未确认 (离线)
                  </span>
                )}
              </div>
            </div>
          </div>

          {result.reason && (
            <p className="text-sm text-rose-600 font-mono bg-rose-50 p-3 rounded-lg">
              {result.reason}
            </p>
          )}

          {/* 凭证核心摘要 */}
          {parsedCred && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-neutral-50 p-4 rounded-lg">
              <div>
                <span className="text-neutral-500">凭证 ID:</span>
                <p className="font-mono text-xs font-medium text-neutral-800 truncate">
                  {parsedCred.credentialId}
                </p>
              </div>
              <div>
                <span className="text-neutral-500">签发者:</span>
                <p className="text-neutral-800 font-medium">
                  {parsedCred.issuer?.name} ({parsedCred.issuer?.id})
                </p>
              </div>
              <div>
                <span className="text-neutral-500">签发时间:</span>
                <p className="text-neutral-800 font-medium">
                  {parsedCred.issuedAt ? new Date(parsedCred.issuedAt).toLocaleString() : '未知'}
                </p>
              </div>
              <div>
                <span className="text-neutral-500">记录类型:</span>
                <p className="text-neutral-800 font-medium capitalize">
                  {parsedCred.recordType} (版本 {parsedCred.revisionId || '1'})
                </p>
              </div>
            </div>
          )}

          {/* Base 链上存证展示 */}
          {(parsedCred?.onChainAnchor || result.onlineStatus?.onChainTxHash) && (
            <div className="p-4 bg-sky-50 border border-sky-100 rounded-lg text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sky-900">Base 链上存证信息 (Layer 2)</span>
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-sky-200 text-sky-800">
                  {result.onlineStatus?.onChainStatus || parsedCred?.onChainAnchor?.status || '已存证'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-sky-800 mt-2">
                <div>网络: Base Sepolia (Chain ID: 84532)</div>
                <div>
                  状态: {result.onlineStatus?.onChainStatus || parsedCred?.onChainAnchor?.status || 'submitted'}
                </div>
                {(result.onlineStatus?.onChainTxHash || parsedCred?.onChainAnchor?.txHash) && (
                  <div className="col-span-2 font-mono truncate">
                    交易哈希:{' '}
                    <a
                      href={`https://sepolia.basescan.org/tx/${result.onlineStatus?.onChainTxHash || parsedCred?.onChainAnchor?.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-sky-900 hover:text-sky-700"
                    >
                      {result.onlineStatus?.onChainTxHash || parsedCred?.onChainAnchor?.txHash} ↗
                    </a>
                  </div>
                )}
              </div>
              <p className="text-xs text-sky-700/80 pt-1">
                💡 链上存证相当于不可篡改的公共防伪钢印，仅记录防伪指纹哈希，绝不上传任何个人隐私文本。
              </p>
            </div>
          )}

          {/* 包含的断言与纠偏状态 */}
          {parsedCred?.claims && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                包含的观察断言与用户反馈 ({parsedCred.claims.length} 项)
              </h3>
              <div className="space-y-3">
                {parsedCred.claims.map((claim: any, idx: number) => (
                  <div key={idx} className="p-4 border border-neutral-200 rounded-lg bg-white space-y-2">
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span className="font-medium text-neutral-700">{claim.title || claim.claimType}</span>
                      {claim.userCorrection ? (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            claim.userCorrection.status === 'confirmed'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          用户反馈: {claim.userCorrection.status === 'confirmed' ? '已确认' : '已反驳/补充'}
                        </span>
                      ) : (
                        <span className="text-neutral-400">原始观察</span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-800">{claim.statement}</p>
                    {claim.userCorrection?.userComment && (
                      <p className="text-xs text-neutral-600 bg-neutral-50 p-2 rounded border border-neutral-100 italic">
                        用户说明: “{claim.userCorrection.userComment}”
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 极客与开发者密码学审计折叠面板 */}
          <div className="pt-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="text-xs text-neutral-500 hover:text-neutral-800 flex items-center gap-1 font-mono transition"
            >
              <span>{showTechnicalDetails ? '▾ 收起' : '▸ 展开'} 密码学与离线验算技术审计明细</span>
            </button>
            {showTechnicalDetails && (
              <div className="mt-3 p-3 bg-neutral-950 text-neutral-300 rounded-lg font-mono text-xs space-y-2 overflow-x-auto">
                <div>
                  <span className="text-neutral-500">内容指纹 (SHA-256 Digest):</span>{' '}
                  <span className="text-emerald-400 break-all">{parsedCred?.contentDigest || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Ed25519 签名 (Signature Hex):</span>{' '}
                  <span className="text-sky-300 break-all">{parsedCred?.signature || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-neutral-500">公钥来源 (Issuer Public Key):</span>
                  <pre className="text-[11px] text-neutral-400 mt-1 whitespace-pre-wrap">
                    {parsedCred?.issuer?.publicKeyPem || '使用平台预埋受信任公钥'}
                  </pre>
                </div>
                <div className="text-[11px] text-neutral-500 pt-1 border-t border-neutral-800">
                  支持使用 Node.js / OpenSSL / WebCrypto 进行 100% 离线脱机验算，无须信任本服务器。
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

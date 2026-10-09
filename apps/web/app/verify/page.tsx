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

export default function VerifyPage() {
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [parsedCred, setParsedCred] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Eva 记录凭证查验
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          独立核验认知记录的完整性、签发者签名、用户纠偏声明及链上存证状态
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm mb-8">
        <label className="block text-sm font-medium text-neutral-700 mb-2">
          上传凭证文件 (.json) 或粘贴凭证内容
        </label>
        <div className="mb-4">
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-neutral-100 file:text-neutral-700 hover:file:bg-neutral-200 cursor-pointer"
          />
        </div>
        <textarea
          rows={6}
          className="w-full p-3 font-mono text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-black focus:outline-none"
          placeholder="在此粘贴 .eva.json 凭证内容..."
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => void handleVerify(jsonInput)}
            disabled={loading || !jsonInput.trim()}
            className="px-5 py-2.5 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 transition"
          >
            {loading ? '正在查验...' : '立即查验'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-6">
          {error}
        </div>
      )}

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

          {/* 凭证元信息 */}
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
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          claim.userCorrection.status === 'confirmed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
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
        </div>
      )}
    </div>
  );
}

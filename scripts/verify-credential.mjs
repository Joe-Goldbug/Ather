#!/usr/bin/env node
// scripts/verify-credential.mjs
// 独立可验证凭证查验工具（完全支持脱机独立验签 + 在线状态核对）
// 用法：
//   node scripts/verify-credential.mjs <credential.json> [--api-url http://127.0.0.1:3101]

import { readFileSync } from 'node:fs';
import { verifyCredentialOffline } from '../packages/core/dist/src/credential/index.js';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log(`用法: node scripts/verify-credential.mjs <credential.json> [--api-url <url>]`);
  process.exit(args.length === 0 ? 1 : 0);
}

const filePath = args[0];
let apiUrl = 'http://127.0.0.1:3101';

const apiIndex = args.indexOf('--api-url');
if (apiIndex !== -1 && args[apiIndex + 1]) {
  apiUrl = args[apiIndex + 1].replace(/\/$/, '');
}

let credential;
try {
  const content = readFileSync(filePath, 'utf8');
  credential = JSON.parse(content);
} catch (err) {
  console.error(`[verify-credential] 读取或解析凭证文件失败: ${err.message}`);
  process.exit(1);
}

console.log('========================================================');
console.log('              Eva 可验证记录凭证独立查验工具            ');
console.log('========================================================\n');

console.log(`凭证 ID:        ${credential.credentialId || '未知'}`);
console.log(`记录 ID:        ${credential.recordId || '未知'} (版本: ${credential.revisionId || '1'})`);
console.log(`记录类型:      ${credential.recordType || '未知'}`);
console.log(`签发者:        ${credential.issuer?.name || '未知'} (${credential.issuer?.id || '未知'})`);
console.log(`签发时间:      ${credential.issuedAt || '未知'}`);
console.log(`包含断言项:    ${credential.claims?.length || 0} 条`);

if (credential.onChainAnchor) {
  console.log(`\n[第二层存证信息]`);
  console.log(`  目标网络:    ${credential.onChainAnchor.chain} (ChainID: ${credential.onChainAnchor.chainId})`);
  console.log(`  存证状态:    ${credential.onChainAnchor.status}`);
  if (credential.onChainAnchor.txHash) {
    console.log(`  交易哈希:    ${credential.onChainAnchor.txHash}`);
  }
}

console.log('\n---------------- 第一阶段：脱机密码学校验 ----------------');
const offlineResult = verifyCredentialOffline(credential);

if (offlineResult.valid) {
  console.log('✅ 离线验签结果:  通过 (PASS)');
  console.log(`   - 规范化摘要匹配:  ${offlineResult.digestMatch ? '一致' : '不一致'}`);
  console.log(`   - 数字签名验证:    ${offlineResult.signatureValid ? '有效' : '无效'}`);
  console.log(`   - 内容完整性:      未受篡改 (Unmodified)`);
} else {
  console.log('❌ 离线验签结果:  失败 (FAIL)');
  console.log(`   - 失败原因:        ${offlineResult.reason}`);
  console.log(`   - 文件篡改状态:    ${offlineResult.tampered ? '已篡改 (Tampered)' : '未确定'}`);
}

console.log('\n---------------- 第二阶段：在线凭证状态查询 ----------------');
try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  const statusUrl = `${apiUrl}/api/credentials/${encodeURIComponent(credential.credentialId)}/status`;
  const response = await fetch(statusUrl, { signal: controller.signal });
  clearTimeout(timeout);

  if (response.ok) {
    const statusData = await response.json();
    console.log(`✅ 在线状态查询:  成功 (${statusData.queriedAt})`);
    console.log(`   - 当前凭证状态:    ${statusData.status}`);
    if (statusData.supersededBy) {
      console.log(`   - 替代凭证 ID:    ${statusData.supersededBy}`);
    }
    if (statusData.onChainStatus && statusData.onChainStatus !== 'none') {
      console.log(`   - Base 链上状态:   ${statusData.onChainStatus} (Tx: ${statusData.onChainTxHash || '无'})`);
    }
  } else if (response.status === 404) {
    console.log('⚠️ 在线状态查询:  凭证在状态注册表中未找到 (Not Found)');
  } else {
    console.log(`⚠️ 在线状态查询:  服务响应状态码 ${response.status}`);
  }
} catch {
  console.log('⚠️ 在线状态查询:  当前状态未确认 (无法连接状态服务或网络超时)');
  console.log('   提示: 离线数字签名依然有效，但请在网络恢复后再次核验是否已被撤销或替代。');
}

console.log('\n========================================================\n');

if (!offlineResult.valid) {
  process.exit(1);
}

// 包装执行：对 mihomo TUN 间歇性掐断 TLS 做退避重试
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
let attempt = 0;
const MAX = 8;

function run() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

const code = await run();
if (code === 0) process.exit(0);

for (attempt = 1; attempt <= MAX; attempt += 1) {
  const wait = Math.min(1000 * attempt, 6000);
  process.stderr.write(`\n[retry] 第 ${attempt}/${MAX} 次重试（${wait}ms 后）…\n`);
  await new Promise((r) => setTimeout(r, wait));
  const c = await run();
  if (c === 0) process.exit(0);
}
process.stderr.write(`\n[retry] ${MAX} 次重试后仍失败\n`);
process.exit(1);
